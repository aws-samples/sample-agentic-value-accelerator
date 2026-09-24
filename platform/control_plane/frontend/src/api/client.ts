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

const API_URL = import.meta.env.VITE_API_URL || "";

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

// ─────────────────────────────────────────────────────────────────────────────
// Build Registry APIs — Agents, MCP Servers, Skills, Memory, Harnesses
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildRegistryAgent {
  agent_id: string;
  name: string;
  description?: string;
  runtime: string;
  runtime_ref: string;
  capabilities: string[];
  auth_hint: string;
  status: 'active' | 'pending' | 'rejected' | 'deprecated';
  created_at?: string;
  updated_at?: string;
  curated_id?: string;
}

export interface BuildMcpServer {
  server_id: string;
  name: string;
  url?: string;
  description?: string;
  transport: string;
  capabilities: string[];
  status: 'active' | 'pending' | 'rejected' | 'deprecated';
  created_at?: string;
  updated_at?: string;
  curated_id?: string;
}

export interface BuildSkill {
  skill_id: string;
  name: string;
  description?: string;
  type: string;
  capabilities: string[];
  status: 'active' | 'pending' | 'rejected' | 'deprecated';
  created_at?: string;
  updated_at?: string;
  curated_id?: string;
}

export interface BuildMemory {
  memory_id: string;
  name: string;
  description?: string;
  strategy: string;
  status: 'active' | 'pending' | 'rejected' | 'deprecated';
  created_at?: string;
  updated_at?: string;
}

export interface BuildHarness {
  harness_id: string;
  name: string;
  description?: string;
  harness_type: string;
  foundation_model?: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface BuildCuratedItem {
  id: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
}

export const buildAgentsApi = {
  list: async (): Promise<{ agents: BuildRegistryAgent[]; total: number }> => {
    try {
      const response = await client.get('/api/v1/agents/list');
      return response.data;
    } catch {
      return { agents: [], total: 0 };
    }
  },
  curated: async (): Promise<{ agents: BuildCuratedItem[] }> => {
    try {
      const response = await client.get('/api/v1/agents/curated');
      return response.data;
    } catch {
      return { agents: [] };
    }
  },
  get: async (agentId: string): Promise<BuildRegistryAgent | null> => {
    try {
      const response = await client.get(`/api/v1/agents/${encodeURIComponent(agentId)}`);
      return response.data;
    } catch {
      return null;
    }
  },
};

export const buildMcpApi = {
  list: async (): Promise<{ servers: BuildMcpServer[]; total: number }> => {
    try {
      const response = await client.get('/api/v1/mcp/list');
      return response.data;
    } catch {
      return { servers: [], total: 0 };
    }
  },
  curated: async (): Promise<{ servers: BuildCuratedItem[] }> => {
    try {
      const response = await client.get('/api/v1/mcp/curated');
      return response.data;
    } catch {
      return { servers: [] };
    }
  },
  get: async (serverId: string): Promise<BuildMcpServer | null> => {
    try {
      const response = await client.get(`/api/v1/mcp/${encodeURIComponent(serverId)}`);
      return response.data;
    } catch {
      return null;
    }
  },
};

export const buildSkillsApi = {
  list: async (): Promise<{ skills: BuildSkill[]; total: number }> => {
    try {
      const response = await client.get('/api/v1/skills/list');
      return response.data;
    } catch {
      return { skills: [], total: 0 };
    }
  },
  curated: async (): Promise<{ skills: BuildCuratedItem[] }> => {
    try {
      const response = await client.get('/api/v1/skills/curated');
      return response.data;
    } catch {
      return { skills: [] };
    }
  },
  get: async (skillId: string): Promise<BuildSkill | null> => {
    try {
      const response = await client.get(`/api/v1/skills/${encodeURIComponent(skillId)}`);
      return response.data;
    } catch {
      return null;
    }
  },
};

export const buildMemoryApi = {
  list: async (): Promise<{ memories: BuildMemory[]; total: number }> => {
    try {
      const response = await client.get('/api/v1/memory/list');
      return response.data;
    } catch {
      return { memories: [], total: 0 };
    }
  },
  strategies: async (): Promise<{ strategies: string[] }> => {
    try {
      const response = await client.get('/api/v1/memory/strategies');
      return response.data;
    } catch {
      return { strategies: [] };
    }
  },
  get: async (memoryId: string): Promise<BuildMemory | null> => {
    try {
      const response = await client.get(`/api/v1/memory/${encodeURIComponent(memoryId)}`);
      return response.data;
    } catch {
      return null;
    }
  },
};

export const buildHarnessApi = {
  list: async (): Promise<{ harnesses: BuildHarness[]; total: number }> => {
    try {
      const response = await client.get('/api/v1/harness/list');
      return response.data;
    } catch {
      return { harnesses: [], total: 0 };
    }
  },
  defaults: async (): Promise<any> => {
    try {
      const response = await client.get('/api/v1/harness/defaults');
      return response.data;
    } catch {
      return null;
    }
  },
  get: async (harnessId: string): Promise<BuildHarness | null> => {
    try {
      const response = await client.get(`/api/v1/harness/${encodeURIComponent(harnessId)}`);
      return response.data;
    } catch {
      return null;
    }
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

  /**
   * Per-template CloudWatch metrics.
   *
   * One HTTP call per template, so do NOT loop this over a fleet — use
   * `governGuardrailsApi.telemetry()` plus `metricsByTemplateId()` in
   * components/govern/guardrailTelemetryMetrics.ts, which returns the same numbers
   * for every guardrail in a single request. Kept for single-guardrail detail views.
   */
  getMetrics: async (templateId: string, hours: number = 24): Promise<GuardrailMetrics> => {
    const response = await client.get<GuardrailMetrics>(
      `/api/v1/guardrails/${templateId}/metrics`,
      { params: { hours } },
    );
    return response.data;
  },

  /** Provenance of the template store — distinguishes "no templates" from "table unreachable". */
  storeStatus: async (): Promise<AwsGuardrailStoreStatus> => {
    const response = await client.get<AwsGuardrailStoreStatus>("/api/v1/guardrails/store-status");
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
  resource_type?: "gateway" | "agent" | "tool";
  resource_id?: string;
  // The two policy-authoring UIs (PolicyBuilder, PolicyCreateFlow) submit with
  // different rule vocabularies that the create endpoint both accepts, so the
  // write payload keeps a union wide enough for both. PolicyRecord.rules (the
  // read side) stays narrow.
  rules: {
    id: string;
    type: "allow" | "deny" | "require" | "limit";
    category: string;
    target: string;
    condition: string;
    value: string;
    action: "block" | "warn" | "log" | "enforce";
  }[];
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
  // Return a create-shaped payload pre-seeded from a catalog use case's evidence.
  preseedFromCatalog: async (catalogUseCaseId: string): Promise<UseCaseCreate> => {
    const response = await client.get<UseCaseCreate>(
      `/api/v1/prioritization/preseed-from-catalog/${catalogUseCaseId}`
    );
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

interface BackendScoreProvenance {
  metric: string;
  definition: string;
  polarity: string;
  method: string;
  inputs: string[];
  scored_weight_pct: number;
  known_criteria: number;
  total_criteria: number;
  unknown_criteria: string[];
  min_coverage_pct: number;
  unscored_reason?: string | null;
  live?: boolean;
}

interface BackendGraduation {
  agent_id: string;
  name: string;
  business_unit: string;
  current_level: number;
  target_level: number | null;
  verdict: string;
  /** null means NOT SCORED — too little of the model was known. Never render as 0. */
  readiness: number | null;
  summary: string;
  criteria: {
    label: string; requirement: string; value: string; status: string;
    blocking: boolean; detail?: string; weight?: number; unknown?: boolean;
  }[];
  signals: {
    agreement_rate: number; agreement_trend: string;
    decisions_in_scope?: number; days_in_scope?: number; open_incidents?: number;
    incident_rate?: number; error_rate?: number; guardrail_intervention_rate?: number;
    sufficient_evidence?: boolean; error_rate_measured?: boolean;
  };
  ratchet: { step_down_triggered: boolean; step_down_reason?: string | null };
  reviewer_hours_per_month: number;
  score_provenance?: BackendScoreProvenance | null;
  blocking_failures?: string[];
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
    // Passed through as null when unscored. Coercing to 0 here would put an
    // uninstrumented agent at the bottom of a readiness ranking as though it had
    // been assessed and failed.
    readiness: d.readiness ?? null,
    summary: d.summary,
    // `insufficient` is carried through, NOT folded into `warning`. This adapter
    // used to map it to "warning", which erased the distinction between a
    // criterion that FAILED and one that could not be evaluated — the same
    // unknown-as-failure conflation the scoring model was fixed to avoid.
    criteria: (d.criteria || []).map(c => ({
      label: c.label, requirement: c.requirement, value: c.value,
      status: c.status,
      blocking: c.blocking, detail: c.detail,
      weight: c.weight ?? 0,
      unknown: c.unknown ?? c.status === 'insufficient',
    })),
    agreementRate: d.signals?.agreement_rate ?? 0,
    agreementTrend: d.signals?.agreement_trend ?? "flat",
    // Track-record signals the drawer renders. Previously dropped, so the drawer
    // showed blanks for data the backend was already returning.
    decisionsInScope: d.signals?.decisions_in_scope ?? 0,
    daysInScope: d.signals?.days_in_scope ?? 0,
    openIncidents: d.signals?.open_incidents ?? 0,
    incidentRate: d.signals?.incident_rate ?? 0,
    errorRate: d.signals?.error_rate ?? 0,
    guardrailInterventionRate: d.signals?.guardrail_intervention_rate ?? 0,
    sufficientEvidence: d.signals?.sufficient_evidence ?? false,
    errorRateMeasured: d.signals?.error_rate_measured ?? false,
    reviewerHoursPerMonth: d.reviewer_hours_per_month,
    stepDown: { triggered: !!d.ratchet?.step_down_triggered, reason: d.ratchet?.step_down_reason ?? undefined },
    reclaimable: d.verdict === "ready" && !d.ratchet?.step_down_triggered,
    blockingFailures: d.blocking_failures ?? [],
    scoreProvenance: d.score_provenance
      ? {
          metric: d.score_provenance.metric,
          definition: d.score_provenance.definition,
          polarity: d.score_provenance.polarity,
          method: d.score_provenance.method,
          inputs: d.score_provenance.inputs ?? [],
          scoredWeightPct: d.score_provenance.scored_weight_pct,
          knownCriteria: d.score_provenance.known_criteria,
          totalCriteria: d.score_provenance.total_criteria,
          unknownCriteria: d.score_provenance.unknown_criteria ?? [],
          minCoveragePct: d.score_provenance.min_coverage_pct,
          unscoredReason: d.score_provenance.unscored_reason ?? undefined,
          live: d.score_provenance.live ?? true,
        }
      : undefined,
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

// Enhanced Cost Explorer dimensions
/**
 * Cost Explorer spend by region. Carries NO `regions` provenance block on purpose:
 * CE is a pinned single-endpoint service, so this already covers every region the
 * account spent in — governed or not. `ungoverned_total` is the point of the split:
 * non-zero means real AI spend that none of the Govern dashboards are watching.
 */
export interface AwsCostByRegion { region: string; amount: number; governed: boolean; }
export interface AwsCostRegionBreakdown { by_region: AwsCostByRegion[]; total: number; governed_total: number; ungoverned_total: number; governed_regions: string[]; period_start: string; period_end: string; live: boolean; source: string; note?: string | null; }
export interface AwsCostByOperation { operation: string; amount: number; }
export interface AwsCostOperationBreakdown { by_operation: AwsCostByOperation[]; total: number; period_start: string; period_end: string; live: boolean; source: string; note?: string | null; }
/**
 * `amount` is a measured Cost Explorer dollar figure. `tokens` is ALWAYS null: it
 * previously held a count back-derived as `dollars / list_rate * 1000`, which was
 * removed because token counts are measured directly from CloudWatch and the
 * derivation was both broken (its key matcher never matched any real model, so
 * every row used one Sonnet rate) and circular (dividing dollars by it to get a
 * $/1K just returns the rate). Read token counts from the runtime metrics instead.
 */
export interface AwsTokenCost { token_type: string; model: string; tokens: number | null; amount: number; }
/**
 * Bedrock bills FOUR token dimensions, not two. `input_total` is the whole input side
 * and INCLUDES both cache dimensions, so the three sub-totals are additive detail:
 *   fresh_input_total + cache_read_total + cache_write_total === input_total
 * `cache_write_total` matters most: cache writes are billed ABOVE the standard input
 * rate, so this is the cache dimension that can make a workload more expensive.
 *
 * Dollars here are measured Cost Explorer amounts; `tokens` on each row is ESTIMATED
 * from spend using list pricing. Do not divide these dollars by CloudWatch token
 * counts - CE attributes by billing date and CloudWatch by usage date, so for
 * Marketplace-billed models the two do not describe the same period.
 */
export interface AwsTokenCostBreakdown { by_token_type: AwsTokenCost[]; input_total: number; output_total: number; fresh_input_total: number; cache_read_total: number; cache_write_total: number; period_start: string; period_end: string; live: boolean; source: string; note?: string | null; }
export interface AwsAgentCostAttribution { agent_id: string; agent_name?: string | null; bedrock_cost: number; compute_cost: number; total_cost: number; invocations: number; cost_per_invocation: number; inference_profile?: string | null; cost_allocation_tag?: string | null; }
export interface AwsAgentCostResponse { by_agent: AwsAgentCostAttribution[]; total_bedrock: number; total_compute: number; total: number; period_start: string; period_end: string; live: boolean; source: string; note?: string | null; }
export interface AwsAgentForecastPoint { month: string; predicted_invocations: number; predicted_cost: number; confidence_low: number; confidence_high: number; }
export interface AwsAgentForecast { agent_id: string; agent_name?: string | null; historical_invocations: number; historical_cost: number; avg_cost_per_invocation: number; trend: 'growing' | 'declining' | 'stable'; trend_pct: number; forecast: AwsAgentForecastPoint[]; forecast_total_invocations: number; forecast_total_cost: number; }
export interface AwsAgentForecastResponse { by_agent: AwsAgentForecast[]; total_historical_cost: number; total_forecast_cost: number; forecast_months: number; lookback_days: number; period_start: string; period_end: string; live: boolean; source: string; note?: string | null; }
export interface AwsSavingsPlanCoverage { coverage_pct: number; on_demand_cost: number; sp_covered_cost: number; total_cost: number; }
export interface AwsRICoverage { utilization_pct: number; used_hours: number; total_hours: number; }
export interface AwsCommitmentCoverage { savings_plans?: AwsSavingsPlanCoverage | null; reserved_instances?: AwsRICoverage | null; period_start: string; period_end: string; live: boolean; source: string; note?: string | null; }

// Usage breakdown and quotas
export interface AwsUsageDetail { usage_type: string; region: string; cost: number; usage_quantity: number; unit?: string | null; }
export interface AwsUsageBreakdown { by_usage: AwsUsageDetail[]; total_cost: number; period_start: string; period_end: string; live: boolean; source: string; note?: string | null; }
export interface AwsServiceQuota { quota_code: string; quota_name: string; value: number; unit?: string | null; adjustable: boolean; global_quota: boolean; usage_metric_namespace?: string | null; usage_metric_name?: string | null; }
export interface AwsServiceQuotasResponse { service_code: string; service_name: string; quotas: AwsServiceQuota[]; total_quotas: number; adjustable_quotas: number; live: boolean; source: string; note?: string | null; }
export interface AwsAnomalyMonitor { monitor_arn: string; monitor_name: string; monitor_type: string; monitor_dimension?: string | null; creation_date?: string | null; }
export interface AwsAnomalyMonitorsResponse { monitors: AwsAnomalyMonitor[]; total: number; live: boolean; source: string; note?: string | null; }
export interface AwsBedrockUsageMetric { model_id: string; invocations: number; input_tokens: number; output_tokens: number; latency_avg_ms: number; throttles: number; errors: number; }
export interface AwsBedrockUsageResponse { by_model: AwsBedrockUsageMetric[]; total_invocations: number; total_input_tokens: number; total_output_tokens: number; window_days: number; live: boolean; source: string; note?: string | null; }

// Cost Comparison Drivers
/** How a line item changed. `new` and `stopped` are what explain a change: one of each,
 *  similar in size, usually means a workload moved rather than spend growing. */
export type CostChangeKind = 'new' | 'stopped' | 'increase' | 'decrease';

export interface AwsCostComparisonDriver {
  driver_type: string;
  driver_value: string;
  base_cost: number;
  comparison_cost: number;
  absolute_difference: number;
  percentage_difference: number;
  /** Share of GROSS movement WITHIN this driver_type, 0-100. Not a share of the net
   *  change - that denominator produced values up to 1817% when increases and decreases
   *  offset each other. */
  contribution_pct: number;
  change_kind: CostChangeKind;
}
export interface AwsCostComparisonResponse {
  drivers: AwsCostComparisonDriver[];
  base_period_start: string;
  base_period_end: string;
  comparison_period_start: string;
  comparison_period_end: string;
  base_total: number;
  comparison_total: number;
  total_difference: number;
  total_difference_pct: number;
  /** Gross movement, which the net figure hides: this account moved +$1,679 up and
   *  -$1,547 down for a net change of +$37. "Flat" and "a lot moved and cancelled" are
   *  very different findings. */
  gross_increase: number;
  gross_decrease: number;
  /** Service-level counts over the FULL set, including rows the 50-row driver list
   *  truncates - so they will not always equal what you can count on screen. */
  increase_count: number;
  decrease_count: number;
  new_count: number;
  stopped_count: number;
  live: boolean;
  source: string;
  note?: string | null;
}

// Rightsizing Recommendations
export interface AwsRightsizingTarget { instance_type: string; platform?: string | null; region?: string | null; estimated_monthly_cost: number; estimated_monthly_savings: number; estimated_savings_pct: number; }
export interface AwsRightsizingRecommendation { account_id: string; instance_id: string; instance_name?: string | null; instance_type: string; recommendation_type: string; finding_reason?: string | null; current_monthly_cost: number; target?: AwsRightsizingTarget | null; savings_currency: string; }
export interface AwsRightsizingResponse { recommendations: AwsRightsizingRecommendation[]; total_recommendations: number; total_estimated_savings: number; lookback_period: string; live: boolean; source: string; note?: string | null; }

// Dashboard Summary (fast load)
export interface AwsFinOpsDashboardSummary {
  total_mtd: number;
  total_last_month: number;
  mtd_change_pct: number;
  ai_mtd: number;
  ai_last_month: number;
  budget_count: number;
  budgets_over_80_pct: number;
  budgets_over_100_pct: number;
  anomaly_count_30d: number;
  agent_count: number;
  agent_total_cost_30d: number;
  live: boolean;
  source: string;
  cached_at?: string | null;
  note?: string | null;
}

// Savings Plans Purchase Recommendations
export interface AwsSavingsPlansPurchaseRecommendation {
  savings_plans_type: string;
  term_in_years: string;
  payment_option: string;
  hourly_commitment: number;
  estimated_monthly_savings: number;
  estimated_savings_percentage: number;
  upfront_cost: number;
  on_demand_cost_equivalent: number;
  current_on_demand_spend: number;
}
export interface AwsSavingsPlansPurchaseResponse {
  recommendations: AwsSavingsPlansPurchaseRecommendation[];
  total_estimated_monthly_savings: number;
  lookback_period: string;
  live: boolean;
  source: string;
  note?: string | null;
}

// Savings Plans Utilization
export interface AwsSavingsPlansUtilizationByTime {
  time_period: string;
  utilization_pct: number;
  used_commitment: number;
  unused_commitment: number;
  savings: number;
  total_commitment: number;
}
export interface AwsSavingsPlansUtilizationResponse {
  by_time: AwsSavingsPlansUtilizationByTime[];
  overall_utilization_pct: number;
  total_used: number;
  total_unused: number;
  total_savings: number;
  period_start: string;
  period_end: string;
  live: boolean;
  source: string;
  note?: string | null;
}

// RI Purchase Recommendations
export interface AwsRIPurchaseRecommendation {
  instance_type: string;
  region: string;
  platform: string;
  scope: string;
  recommended_quantity: number;
  term_in_years: string;
  payment_option: string;
  upfront_cost: number;
  recurring_monthly_cost: number;
  estimated_monthly_savings: number;
  estimated_savings_percentage: number;
  current_monthly_on_demand: number;
  average_utilization: number;
}
export interface AwsRIPurchaseResponse {
  recommendations: AwsRIPurchaseRecommendation[];
  total_estimated_monthly_savings: number;
  service: string;
  lookback_period: string;
  live: boolean;
  source: string;
  note?: string | null;
}

// Cost Categories
export interface AwsCostCategory {
  name: string;
  cost_category_arn?: string | null;
  effective_start?: string | null;
  effective_end?: string | null;
  rules_count: number;
  values: string[];
  default_value?: string | null;
}
export interface AwsCostCategoriesResponse {
  categories: AwsCostCategory[];
  total: number;
  live: boolean;
  source: string;
  note?: string | null;
}

// ─── Govern Models — live Bedrock catalog + CloudWatch runtime metrics ───
/** `available_regions`: governed regions whose catalog lists this model. A model is not
 *  callable in a region absent from this list, so a one-element list is a real constraint. */
export interface AwsFoundationModel { model_id: string; name: string; provider: string; input_modalities: string[]; output_modalities: string[]; streaming: boolean; inference_types: string[]; lifecycle: string; available_regions: string[]; }
export interface AwsFoundationModelCatalog { models: AwsFoundationModel[]; total: number; providers: string[]; active: number; live: boolean; source: string; note?: string | null;  regions?: AwsRegionProvenance | null;}
/** `active_regions`: where this model recorded invocations in the window. NOT the same as
 *  AwsFoundationModel.available_regions — a model can be available somewhere and never called there. */
/**
 * `cache_read_tokens` / `cache_write_tokens` are NULL when CloudWatch published no
 * datapoint for the metric in the window, i.e. prompt caching was never exercised on
 * that model. That is NOT the same as 0, which would assert a measured 0% cache hit
 * rate. Render null as "not measured" and exclude it from hit-rate denominators.
 */
export interface AwsModelRuntimeMetrics { model_id: string; invocations: number; avg_latency_ms: number; client_errors: number; server_errors: number; input_tokens: number; output_tokens: number; cache_read_tokens: number | null; cache_write_tokens: number | null; error_rate_pct: number; active_regions: string[]; }
export interface AwsModelMetricsResponse { by_model: AwsModelRuntimeMetrics[]; total_invocations: number; avg_latency_ms: number; fleet_error_rate_pct: number; window_days: number; live: boolean; source: string; note?: string | null;  regions?: AwsRegionProvenance | null;}

// Cross-region inference profiles + intelligent prompt routers (model routing governance)
/**
 * Two region lists, and they are NOT interchangeable:
 *   `regions`            — where the profile routes traffic TO (its routing fan-out)
 *   `available_regions`  — governed regions whose ListInferenceProfiles returned it
 * A profile that routes to five regions can still have been listed from one.
 */
export interface AwsInferenceProfile { id: string; name: string; arn?: string | null; description?: string | null; type: string; status: string; model_count: number; regions: string[]; available_regions: string[]; }
export interface AwsInferenceProfilesResponse { profiles: AwsInferenceProfile[]; total: number; system_defined: number; application_defined: number; live: boolean; source: string; note?: string | null;  regions?: AwsRegionProvenance | null;}
/** `available_regions`: governed regions whose ListPromptRouters returned this router. AWS
 *  default routers carry the same name in every region, so the backend dedupes by name. */
export interface AwsPromptRouter { name: string; arn?: string | null; description?: string | null; status: string; type: string; model_count: number; fallback_model?: string | null; available_regions: string[]; }
export interface AwsPromptRoutersResponse { routers: AwsPromptRouter[]; total: number; live: boolean; source: string; note?: string | null;  regions?: AwsRegionProvenance | null;}

// ─── Govern Model Invocations — real Bedrock invocation aggregates (/aws/bedrock/model-invocations) ───
export interface AwsModelInvocationBreakdown { model_id: string; operation?: string | null; invocations: number; input_tokens: number; output_tokens: number; total_tokens: number; }
// Note: named distinctly from AwsStopReasonCount (invocation-safety) — this one keys on `stop_reason`.
export interface AwsInvocationStopReasonCount { stop_reason: string; count: number; }
export interface AwsCallerCount { caller: string; count: number; }
export interface AwsInvocationAggregatesResponse { window_hours: number; total_invocations: number; total_input_tokens: number; total_output_tokens: number; total_tokens: number; per_model: AwsModelInvocationBreakdown[]; stop_reasons: AwsInvocationStopReasonCount[]; guardrail_intervention_count: number; grounding_signal_count: number; per_caller: AwsCallerCount[]; callers_truncated: boolean; records_scanned: number; live: boolean; source: string; note?: string | null; }

export const governModelsApi = {
  catalog: async (provider?: string): Promise<AwsFoundationModelCatalog> =>
    (await client.get("/api/v1/govern/models/catalog", { params: provider ? { provider } : {} })).data,
  runtimeMetrics: async (days = 7): Promise<AwsModelMetricsResponse> =>
    (await client.get("/api/v1/govern/models/runtime-metrics", { params: { days } })).data,
  /** Cross-region inference profiles. GET /models/inference-profiles */
  inferenceProfiles: async (): Promise<AwsInferenceProfilesResponse> =>
    (await client.get("/api/v1/govern/models/inference-profiles")).data,
  /** Intelligent prompt routers. GET /models/prompt-routers */
  promptRouters: async (): Promise<AwsPromptRoutersResponse> =>
    (await client.get("/api/v1/govern/models/prompt-routers")).data,
  /** Real Bedrock model-invocation aggregates from /aws/bedrock/model-invocations. GET /govern/models/invocations */
  invocations: async (hours = 24): Promise<AwsInvocationAggregatesResponse> =>
    (await client.get("/api/v1/govern/models/invocations", { params: { hours } })).data,
};

// ─── Govern Evals — live Bedrock evaluation jobs ───
export interface AwsEvaluationJob { job_arn: string; name: string; status: string; application_type: string; task_types: string[]; models: string[]; created_at?: string | null; }
export interface AwsEvaluationJobsResponse { jobs: AwsEvaluationJob[]; total: number; completed: number; in_progress: number; failed: number; model_evals: number; rag_evals: number; live: boolean; source: string; note?: string | null;  regions?: AwsRegionProvenance | null;}

export interface AwsMetricScore { metric: string; mean_score: number; count: number; }
export interface AwsEvalScoresResponse { job_arn: string; job_name: string; application_type: string; metrics: AwsMetricScore[]; records_scored: number; capped: boolean; live: boolean; source: string; note?: string | null; }

export const governEvalsApi = {
  jobs: async (maxJobs = 100): Promise<AwsEvaluationJobsResponse> =>
    (await client.get("/api/v1/govern/evals/jobs", { params: { max_jobs: maxJobs } })).data,
  // Use job_name for lookup (safer than passing full ARNs with account IDs).
  scores: async (jobName: string): Promise<AwsEvalScoresResponse> =>
    (await client.get("/api/v1/govern/evals/scores", { params: { job_name: jobName } })).data,
};

// ─── Govern Knowledge Bases — live Bedrock KB inventory ───
export interface AwsKnowledgeBaseDataSource { data_source_id: string; name: string; status: string; type: string; updated_at?: string | null; }
export interface AwsKnowledgeBaseSummary { knowledge_base_id: string; name: string; status: string; description?: string | null; embedding_model_arn?: string | null; storage_type?: string | null; created_at?: string | null; updated_at?: string | null; data_source_count: number; data_sources: AwsKnowledgeBaseDataSource[]; }
export interface AwsKnowledgeBasesResponse { knowledge_bases: AwsKnowledgeBaseSummary[]; total: number; active: number; by_storage_type: Record<string, number>; by_embedding_model: Record<string, number>; total_data_sources: number; live: boolean; source: string; note?: string | null;  regions?: AwsRegionProvenance | null;}

export const governKnowledgeBasesApi = {
  list: async (maxKbs = 100): Promise<AwsKnowledgeBasesResponse> =>
    (await client.get("/api/v1/govern/knowledge-bases", { params: { max_kbs: maxKbs } })).data,
};

// ─── Govern Governance Posture — KMS encryption keys + preventive SCPs ───
export interface AwsKmsKey { key_id: string; alias?: string | null; arn?: string | null; manager: string; enabled: boolean; rotation_enabled?: boolean | null; key_spec?: string | null; description?: string | null; creation_date?: string | null; }
export interface AwsKmsInventoryResponse { keys: AwsKmsKey[]; total: number; customer_managed: number; aws_managed: number; with_rotation: number; aliases_total: number; live: boolean; source: string; note?: string | null; }
export const governKmsApi = {
  /** KMS key + alias inventory (encryption-at-rest evidence). GET /governance/kms */
  inventory: async (): Promise<AwsKmsInventoryResponse> =>
    (await client.get("/api/v1/govern/governance/kms")).data,
};

export interface AwsScpPolicy { id: string; name: string; arn?: string | null; description?: string | null; aws_managed: boolean; attached_target_count?: number | null; }
export interface AwsScpResponse { policies: AwsScpPolicy[]; total: number; aws_managed_count: number; custom_count: number; live: boolean; source: string; note?: string | null; }
export const governScpApi = {
  /** Service Control Policies (preventive controls). GET /governance/scp */
  policies: async (): Promise<AwsScpResponse> =>
    (await client.get("/api/v1/govern/governance/scp")).data,
};

// ─── Govern AI Estate Inventory — tagged AWS resources supporting the AI estate ───
export interface AwsTaggedResource { arn?: string | null; service: string; resource_type?: string | null; region?: string | null; ai_related: boolean; tags: Record<string, string>; }
export interface AwsResourceInventoryResponse { resources: AwsTaggedResource[]; total: number; by_service: Record<string, number>; ai_related: number; tag_keys: string[]; live: boolean; source: string; note?: string | null; }
export const governInventoryApi = {
  /** Tagged-resource inventory of the AI estate. GET /governance/inventory */
  resources: async (maxResources = 500): Promise<AwsResourceInventoryResponse> =>
    (await client.get("/api/v1/govern/governance/inventory", { params: { max_resources: maxResources } })).data,
};

// ─── Govern Resource Tags — real governed denominator + governance-tag coverage ───
export interface AwsGovernanceTaggedResource { arn?: string | null; service: string; resource_type?: string | null; region?: string | null; has_owner: boolean; has_project: boolean; has_env: boolean; has_scope: boolean; governed: boolean; tags: Record<string, string>; }
export interface AwsGovernanceResourceTagsResponse { resource_types_scanned: string[]; total_ai_resources: number; with_owner: number; with_project: number; with_env: number; with_scope: number; owner_coverage_pct: number; project_coverage_pct: number; env_coverage_pct: number; scope_coverage_pct: number; governance_tagged: number; ungoverned: number; tag_coverage_pct: number; governed_denominator: number; governed_pct: number; by_type: Record<string, number>; tag_keys_observed: string[]; sample_resources: AwsGovernanceTaggedResource[]; live: boolean; source: string; note?: string | null; }

export const governResourceTagsApi = {
  /** Governed denominator + governance-tag coverage of the AI estate. GET /governance/resource-tags */
  coverage: async (maxResources = 1000, maxSamples = 25): Promise<AwsGovernanceResourceTagsResponse> =>
    (await client.get("/api/v1/govern/governance/resource-tags", { params: { max_resources: maxResources, max_samples: maxSamples } })).data,
};

// ─── Region provenance — which regions a merged Govern response actually covered ───
/**
 * Attached to Govern responses that aggregate across the governed-region set.
 *
 * `reachable` + `unreachable` partition `queried`. `degraded` is a SUBSET of
 * `reachable`: those regions answered, but with no live data (service not enabled
 * there, or the role lacks the read), so they contributed nothing to the totals.
 * Without checking `degraded`, an aggregate over three regions where two are dark
 * reads as complete.
 */
export interface AwsRegionProvenance {
  queried: string[];
  reachable: string[];
  unreachable: string[];
  degraded: string[];
  /** Null when there is nothing worth saying (a single complete region). */
  summary?: string | null;
}

/** Declared region coverage of one Govern surface. See backend core/region_scope.py. */
export type AwsRegionScopeKind = 'multi-region' | 'single-region' | 'account-pinned' | 'control-plane';
export interface AwsSurfaceScope { surface: string; prefix: string; scope: AwsRegionScopeKind; meaning: string; }
export interface AwsRegionScopeResponse {
  surfaces: AwsSurfaceScope[];
  by_scope: Partial<Record<AwsRegionScopeKind, string[]>>;
  scope_meanings: Partial<Record<AwsRegionScopeKind, string>>;
  governed_regions: string[];
  default_region: string;
  source: string;
}

// ─── Govern Guardrails — live Bedrock guardrail intervention telemetry ───
export interface AwsGuardrailSummary {
  guardrail_id: string;
  name: string;
  /** Governed region the guardrail is defined in; the merged fleet can hold same-named guardrails from different regions. */
  region?: string | null;
  status: string;
  version: string;
  description?: string | null;
  created_at?: string | null;
  invocations: number;
  /** InvocationsIntervened — any guardrail action, including PII masking that still returned a response. NOT a refusal count. */
  interventions: number;
  /** InvocationsBlocked — refusals only. Always <= interventions. */
  blocked: number;
  intervention_rate_pct: number;
  has_metrics: boolean;
}
export interface AwsGuardrailPolicyBreakdown { policy_type: string; label: string; interventions: number; dimension: string; }
export interface AwsGuardrailTelemetryResponse {
  guardrails: AwsGuardrailSummary[];
  by_policy: AwsGuardrailPolicyBreakdown[];
  total_guardrails: number;
  total_invocations: number;
  total_interventions: number;
  /** Sum of InvocationsBlocked; refusals only, never derived from interventions. */
  total_blocked: number;
  intervention_rate_pct: number;
  guardrails_with_metrics: number;
  window_days: number;
  live: boolean;
  source: string;
  note?: string | null;
  regions?: AwsRegionProvenance | null;
}

/** Provenance of the guardrail-template store (DynamoDB), so "no templates" can be told from "table unreachable". */
export interface AwsGuardrailStoreStatus {
  table_name: string;
  /** Where the template table lives (control plane). Overridable with GUARDRAILS_TABLE_REGION. */
  control_region: string;
  /** Where the Bedrock guardrails those templates describe live. Often a different region. */
  governed_region: string;
  reachable: boolean;
  /** Populated only when the table could not be read — says which table and which region. */
  note?: string | null;
}

export const governGuardrailsApi = {
  telemetry: async (days = 30): Promise<AwsGuardrailTelemetryResponse> =>
    (await client.get("/api/v1/govern/guardrails/telemetry", { params: { days } })).data,
  /** Live Bedrock guardrails with policy config (content filters / PII / topics), from
   *  the governed region. Returns the GuardrailTemplate shape the Govern UI renders. */
  list: async (): Promise<GuardrailTemplate[]> =>
    (await client.get("/api/v1/govern/guardrails/list")).data,
};

// ─── Govern Multi-Region — region discovery + governed-region management ───
export interface AwsRegionSignal {
  region: string;
  guardrails: number;
  agent_runtimes: number;
  workload_identities: number;
  gateways: number;
  knowledge_bases: number;
  has_bedrock_activity: boolean;
  resource_total: number;
  governed: boolean;
  reachable: boolean;
  note?: string | null;
}
export interface AwsRegionDiscoveryResponse {
  regions: AwsRegionSignal[];
  governed_regions: string[];
  discovered_ungoverned: string[];
  regions_scanned: number;
  live: boolean;
  source: string;
  note?: string | null;
}
export interface AwsGovernedRegionsResponse { regions: string[]; default_region: string; source: string; }

export const governRegionsApi = {
  discovery: async (): Promise<AwsRegionDiscoveryResponse> =>
    (await client.get("/api/v1/govern/regions/discovery")).data,
  governed: async (): Promise<AwsGovernedRegionsResponse> =>
    (await client.get("/api/v1/govern/regions/governed")).data,
  govern: async (regions: string[], mode: "add" | "replace" = "add"): Promise<AwsGovernedRegionsResponse> =>
    (await client.post("/api/v1/govern/regions/govern", { regions, mode })).data,
  /** Declared region coverage per Govern surface — so a panel can say whether its
   *  numbers cover the governed set, one region, or the whole account. */
  scope: async (): Promise<AwsRegionScopeResponse> =>
    (await client.get("/api/v1/govern/regions/scope")).data,
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
  regions?: AwsRegionProvenance | null;
}

// Per-invocation records — METADATA ONLY (never prompt/response content, by design).
export interface AwsInvocationRecord {
  timestamp: string;
  model_id: string;
  region?: string | null;
  operation?: string | null;
  stop_reason?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  guardrail_intervened: boolean;
  guardrail_action?: string | null;
}
export interface AwsInvocationRecordsResponse {
  window_days: number;
  records: AwsInvocationRecord[];
  count: number;
  truncated: boolean;
  log_group?: string | null;
  logging_enabled: boolean;
  live: boolean;
  source: string;
  note?: string | null;
  regions?: AwsRegionProvenance | null;
}

export const governInvocationSafetyApi = {
  telemetry: async (days = 7): Promise<AwsInvocationSafetyResponse> =>
    (await client.get("/api/v1/govern/invocation-safety/telemetry", { params: { days } })).data,
  /** Per-invocation metadata rows (no prompt/response content). GET /invocation-safety/invocations */
  invocations: async (days = 7, limit = 100): Promise<AwsInvocationRecordsResponse> =>
    (await client.get("/api/v1/govern/invocation-safety/invocations", { params: { days, limit } })).data,
};

// ─── Govern Risk Posture — live Security Hub findings ───
export interface AwsSecurityFinding { id: string; title: string; severity: string; product: string; compliance_status?: string | null; resource_type?: string | null; updated_at?: string | null; }
export interface AwsSeverityCount { severity: string; count: number; }
export interface AwsRiskPostureResponse { by_severity: AwsSeverityCount[]; top_findings: AwsSecurityFinding[]; total: number; critical: number; high: number; live: boolean; source: string; note?: string | null;  scanned: number; truncated: boolean; regions?: AwsRegionProvenance | null;}

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

// ─── Govern CloudTrail Lake — long-window AI-activity denominators (aggregates only) ───
export interface AwsCtLakeActionCount { event_source: string; event_name: string; count: number; }
export interface AwsCtLakePrincipalCount { principal: string; count: number; }
export interface AwsCtLakeDayCount { date: string; count: number; }
export interface AwsCtLakeAiActivityResponse { window_days: number; total_events: number; distinct_actions: number; distinct_principals: number; active_days: number; by_action: AwsCtLakeActionCount[]; by_principal: AwsCtLakePrincipalCount[]; by_day: AwsCtLakeDayCount[]; store_name?: string | null; mb_scanned?: number | null; live: boolean; source: string; note?: string | null; cost_note?: string | null; }

export const governCtLakeApi = {
  /** Aggregate long-window AI-activity denominators from CloudTrail Lake. GET /govern/ctlake/ai-activity */
  aiActivity: async (days = 30): Promise<AwsCtLakeAiActivityResponse> =>
    (await client.get("/api/v1/govern/ctlake/ai-activity", { params: { days } })).data,
};

// ─── Govern AgentCore — real deployed agents (Bedrock + AgentCore) + posture ───
/** `arn` is account-masked by the backend (mask_account_id) and is null for classic
 *  Bedrock Agents — only AgentCore runtimes carry an agentRuntimeArn. */
export interface AwsDiscoveredAgent {
  id: string;
  name: string;
  status: string;
  platform: string;
  version?: string | null;
  updated_at?: string | null;
  arn?: string | null;
  /**
   * The agent's own description, verbatim from AWS (ListAgents
   * `agentSummaries[].description` / ListAgentRuntimes `agentRuntimes[].description`).
   * Free — both list calls already return it — but only present when the agent was created
   * with one: 13 of 36 on the reference account. null/absent means AWS holds no description,
   * which must render as absent rather than as a generated sentence.
   *
   * Note: ListAgents does NOT return `guardrailConfiguration` (0 of 7 summaries carried it
   * when measured), so an agent's guardrail binding is not available from the list call and
   * would need a per-agent GetAgent.
   */
  description?: string | null;
}
export interface AwsDiscoveredAgentsResponse { agents: AwsDiscoveredAgent[]; total: number; bedrock_agents: number; agentcore_runtimes: number; live: boolean; source: string; note?: string | null;  regions?: AwsRegionProvenance | null;}
export interface AwsPostureResource { name: string; status?: string | null; updated_at?: string | null; }
export interface AwsPostureCategory { key: string; label: string; total: number; ready: number; items: AwsPostureResource[]; live: boolean; note?: string | null; }
export interface AwsAgentCorePostureResponse { categories: AwsPostureCategory[]; live: boolean; source: string; note?: string | null; }

export interface AwsAgentRuntimeMetric { runtime_name: string; invocations: number; avg_latency_ms: number; errors: number; sessions: number; }
export interface AwsAgentRuntimeMetricsResponse { by_agent: AwsAgentRuntimeMetric[]; window_days: number; live: boolean; source: string; note?: string | null; }

export interface AwsResourceUsageMetric {
  // Correct backend (ResourceUsageMetric) field names:
  service?: string;
  resource?: string;
  name?: string;
  cpu_vcpu_hours: number;
  memory_gb_hours: number;
  window_days?: number;
  // Deprecated (never emitted by the backend; kept optional so unmigrated readers still compile):
  resource_arn?: string;
  agent_name?: string;
  endpoint_name?: string;
}

export interface AwsResourceUsageResponse {
  by_resource: AwsResourceUsageMetric[];
  total_cpu_vcpu_hours: number;
  total_memory_gb_hours: number;
  window_days: number;
  live: boolean;
  source: string;
  note?: string | null;
}

export interface AwsGatewayMetric {
  // Correct backend (GatewayMetric) field names:
  name?: string | null;
  operation?: string;
  protocol?: string | null;
  method?: string | null;
  resource?: string | null;
  invocations: number;
  throttles: number;
  system_errors: number;
  user_errors: number;
  target_type_count?: number;
  latency_avg_ms?: number;
  latency_p50_ms?: number;
  latency_p90_ms?: number;
  latency_p99_ms?: number;
  duration_avg_ms?: number;
  duration_p50_ms?: number;
  duration_p90_ms?: number;
  duration_p99_ms?: number;
  target_execution_time_avg_ms?: number;
  target_execution_time_p50_ms?: number;
  target_execution_time_p90_ms?: number;
  target_execution_time_p99_ms?: number;
  // Deprecated aliases (never emitted by the backend; kept optional to avoid breaking unmigrated readers):
  gateway_id?: string;
  gateway_name?: string;
  avg_latency_ms?: number;
  p99_latency_ms?: number;
  avg_duration_ms?: number;
  avg_target_execution_ms?: number;
}

export interface AwsGatewayMetricsResponse {
  by_gateway: AwsGatewayMetric[];
  total_invocations: number;
  total_errors: number;
  window_days: number;
  live: boolean;
  source: string;
  note?: string | null;
}

export interface AwsMemoryMetric {
  // Correct backend (MemoryMetric) field names:
  name?: string | null;
  invocations: number;
  latency_avg_ms?: number;
  latency_p50_ms?: number;
  latency_p90_ms?: number;
  latency_p99_ms?: number;
  system_errors: number;
  user_errors: number;
  creation_count: number;
  // Deprecated aliases (never emitted by the backend):
  memory_id?: string;
  avg_latency_ms?: number;
}

export interface AwsMemoryMetricsResponse {
  by_memory: AwsMemoryMetric[];
  total_invocations: number;
  window_days: number;
  live: boolean;
  source: string;
  note?: string | null;
}

export interface AwsAgentTrace {
  trace_id: string;
  span_id: string;
  operation_name: string;
  agent_id: string;
  endpoint_name: string;
  session_id: string;
  latency_ms: number;
  error_type?: string | null;
  timestamp: string;
  request_id: string;
}

export interface AwsAgentTracesResponse {
  traces: AwsAgentTrace[];
  total_count: number;
  window_days: number;
  live: boolean;
  source: string;
  note?: string | null;
}

// ─── Detailed AgentCore Resource Lists ───
export interface AwsGateway {
  gateway_id: string;
  name: string;
  status: string;
  description?: string | null;
  protocol_type?: string | null;
  authorization_type?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AwsGatewaysListResponse {
  gateways: AwsGateway[];
  total: number;
  live: boolean;
  source: string;
  note?: string | null;
  regions?: AwsRegionProvenance | null;
}

export interface AwsGatewayTarget {
  target_id: string;
  gateway_id: string;
  name: string;
  status: string;
  target_type?: string | null;
  description?: string | null;
  endpoint_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AwsGatewayTargetsListResponse {
  targets: AwsGatewayTarget[];
  total: number;
  live: boolean;
  source: string;
  note?: string | null;
  regions?: AwsRegionProvenance | null;
}

export interface AwsPolicyEngine {
  policy_engine_id: string;
  name: string;
  status: string;
  description?: string | null;
  policy_store_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AwsPolicyEnginesListResponse {
  policy_engines: AwsPolicyEngine[];
  total: number;
  live: boolean;
  source: string;
  note?: string | null;
  regions?: AwsRegionProvenance | null;
}

export interface AwsWorkloadIdentity {
  name: string;
  workload_identity_id?: string | null;
  description?: string | null;
  created_at?: string | null;
  // OAuth2 return-URL allow-list from GetWorkloadIdentity (NOT IAM resource scoping —
  // agent resource permissions are governed by the agent's IAM execution role).
  oauth2_return_urls?: string[] | null;
  allowed_resources?: string[] | null;
}

export interface AwsWorkloadIdentitiesListResponse {
  workload_identities: AwsWorkloadIdentity[];
  total: number;
  live: boolean;
  source: string;
  note?: string | null;
  regions?: AwsRegionProvenance | null;
}

export const governAgentCoreApi = {
  agents: async (): Promise<AwsDiscoveredAgentsResponse> =>
    (await client.get("/api/v1/govern/agentcore/agents")).data,
  posture: async (): Promise<AwsAgentCorePostureResponse> =>
    (await client.get("/api/v1/govern/agentcore/posture")).data,
  agentMetrics: async (days = 7): Promise<AwsAgentRuntimeMetricsResponse> =>
    (await client.get("/api/v1/govern/agentcore/agent-metrics", { params: { days } })).data,
  resourceUsage: async (days = 7): Promise<AwsResourceUsageResponse> =>
    (await client.get(`/api/v1/govern/agentcore/resource-usage?days=${days}`)).data,
  gatewayMetrics: async (days = 7): Promise<AwsGatewayMetricsResponse> =>
    (await client.get(`/api/v1/govern/agentcore/gateway-metrics?days=${days}`)).data,
  memoryMetrics: async (days = 7): Promise<AwsMemoryMetricsResponse> =>
    (await client.get(`/api/v1/govern/agentcore/memory-metrics?days=${days}`)).data,
  traces: async (days = 7, limit = 100): Promise<AwsAgentTracesResponse> =>
    (await client.get(`/api/v1/govern/agentcore/traces?days=${days}&limit=${limit}`)).data,
  modelInvocations: async (hours = 24, limit = 50) =>
    (await client.get(`/api/v1/govern/agentcore/model-invocations?hours=${hours}&limit=${limit}`)).data,
  // Detailed resource lists
  gateways: async (): Promise<AwsGatewaysListResponse> =>
    (await client.get("/api/v1/govern/agentcore/gateways")).data,
  gatewayTargets: async (gatewayId?: string): Promise<AwsGatewayTargetsListResponse> =>
    (await client.get("/api/v1/govern/agentcore/gateway-targets", { params: gatewayId ? { gateway_id: gatewayId } : {} })).data,
  policyEngines: async (): Promise<AwsPolicyEnginesListResponse> =>
    (await client.get("/api/v1/govern/agentcore/policy-engines")).data,
  workloadIdentities: async (): Promise<AwsWorkloadIdentitiesListResponse> =>
    (await client.get("/api/v1/govern/agentcore/workload-identities")).data,
};

// ─── Govern Security — unified posture from GuardDuty/Macie/Inspector/Access Analyzer/Detective ───
export interface AwsSecuritySeverityCount { severity: string; count: number; }
export interface AwsSecuritySourceSummary { source: string; label: string; dimension: string; total: number; critical: number; high: number; by_severity: AwsSecuritySeverityCount[]; top_types: string[]; live: boolean; note?: string | null; }
export interface AwsSecurityPostureResponse { sources: AwsSecuritySourceSummary[]; total_findings: number; critical: number; high: number; sources_live: number; sources_total: number; live: boolean; source: string; note?: string | null;  regions?: AwsRegionProvenance | null;}

// Inspector2 vulnerability findings (AI-compute vuln posture — CVEs on EC2/ECR/Lambda)
export interface AwsVulnerabilityFinding { finding_arn?: string | null; title: string; severity: string; type: string; status: string; resource_type?: string | null; resource_id?: string | null; cve?: string | null; fix_available?: string | null; first_observed?: string | null; }
export interface AwsVulnerabilitiesResponse { findings: AwsVulnerabilityFinding[]; total: number; by_severity: AwsSecuritySeverityCount[]; critical: number; high: number; medium: number; low: number; by_type: Record<string, number>; covered_resources: number; live: boolean; source: string; note?: string | null;  regions?: AwsRegionProvenance | null;}

export const governSecurityApi = {
  posture: async (): Promise<AwsSecurityPostureResponse> =>
    (await client.get("/api/v1/govern/security/posture")).data,
  /** Inspector2 vulnerability findings detail. GET /security/vulnerabilities */
  vulnerabilities: async (maxFindings = 100): Promise<AwsVulnerabilitiesResponse> =>
    (await client.get("/api/v1/govern/security/vulnerabilities", { params: { max_findings: maxFindings } })).data,
};

// ─── Security Lake — centralized security data lake ───

export interface SecurityLakeDataLake {
  data_lake_arn?: string | null;
  region?: string | null;
  status?: string | null;
  s3_bucket_arn?: string | null;
  encryption_configuration?: Record<string, any>;
  lifecycle_configuration?: Record<string, any>;
  replication_configuration?: Record<string, any>;
}

export interface SecurityLakeSubscriber {
  subscriber_id?: string | null;
  subscriber_arn?: string | null;
  subscriber_name?: string | null;
  subscriber_identity?: Record<string, any>;
  access_types?: string[];
  sources?: any[];
  subscriber_status?: string | null;
  resource_share_arn?: string | null;
  s3_bucket_arn?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface SecurityLakeLogSource {
  region?: string | null;
  account?: string | null;
  sources?: any[];
}

export interface SecurityLakeSummaryResponse {
  data_lakes: SecurityLakeDataLake[];
  data_lakes_count: number;
  subscribers: SecurityLakeSubscriber[];
  subscribers_count: number;
  log_sources: SecurityLakeLogSource[];
  log_sources_count: number;
  live: boolean;
  source: string;
  note?: string | null;
}

export interface SecurityLakeDataLakesResponse {
  data_lakes: SecurityLakeDataLake[];
  total: number;
  live: boolean;
  source: string;
  note?: string | null;
}

export interface SecurityLakeSubscribersResponse {
  subscribers: SecurityLakeSubscriber[];
  total: number;
  live: boolean;
  source: string;
  note?: string | null;
}

export interface SecurityLakeLogSourcesResponse {
  log_sources: SecurityLakeLogSource[];
  total: number;
  live: boolean;
  source: string;
  note?: string | null;
}

export const governSecurityLakeApi = {
  summary: async (): Promise<SecurityLakeSummaryResponse> =>
    (await client.get("/api/v1/govern/security-lake/summary")).data,
  dataLakes: async (): Promise<SecurityLakeDataLakesResponse> =>
    (await client.get("/api/v1/govern/security-lake/data-lakes")).data,
  subscribers: async (): Promise<SecurityLakeSubscribersResponse> =>
    (await client.get("/api/v1/govern/security-lake/subscribers")).data,
  logSources: async (): Promise<SecurityLakeLogSourcesResponse> =>
    (await client.get("/api/v1/govern/security-lake/log-sources")).data,
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

// ─── Govern Cost by Resource — per-RESOURCE AI spend (Cost Explorer resource-level) ───
export interface AwsResourceCost { resource_id: string; resource_arn?: string | null; service?: string | null; amount: number; }
export interface AwsResourceCostResponse { by_resource: AwsResourceCost[]; total: number; resource_count: number; period_start: string; period_end: string; window_days: number; live: boolean; source: string; note?: string | null; }

/**
 * `monthsOffset` shifts the window back that many whole calendar months.
 *
 * 0 (the default, and the previous behaviour) ends the window at the first of NEXT
 * month, so it includes the current partial month - months=1 is month-to-date. Pass
 * months=1 with monthsOffset=1 for the last COMPLETE calendar month, which the API
 * previously could not express at all.
 *
 * Cost Explorer retains roughly 13 months. Anything deeper needs Cost and Usage Reports
 * in S3 queried via Athena, which takes an arbitrary date range rather than a month
 * offset - so that lands as new params here, not as a larger offset.
 */
export const governCostApi = {
  summary: async (months = 6, aiOnly = false, monthsOffset = 0): Promise<AwsCostSummary> =>
    (await client.get("/api/v1/govern/cost/summary", { params: { months, months_offset: monthsOffset, ai_only: aiOnly } })).data,
  byModel: async (months = 6, monthsOffset = 0): Promise<AwsCostModelBreakdown> =>
    (await client.get("/api/v1/govern/cost/by-model", { params: { months, months_offset: monthsOffset } })).data,
  byTag: async (key = "business-unit", months = 6, monthsOffset = 0): Promise<AwsCostTagBreakdown> =>
    (await client.get("/api/v1/govern/cost/by-tag", { params: { key, months, months_offset: monthsOffset } })).data,
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
  // Enhanced Cost Explorer dimensions
  byRegion: async (months = 6, monthsOffset = 0): Promise<AwsCostRegionBreakdown> =>
    (await client.get("/api/v1/govern/cost/by-region", { params: { months, months_offset: monthsOffset } })).data,
  byOperation: async (months = 6, monthsOffset = 0): Promise<AwsCostOperationBreakdown> =>
    (await client.get("/api/v1/govern/cost/by-operation", { params: { months, months_offset: monthsOffset } })).data,
  tokenCosts: async (months = 6, monthsOffset = 0): Promise<AwsTokenCostBreakdown> =>
    (await client.get("/api/v1/govern/cost/token-costs", { params: { months, months_offset: monthsOffset } })).data,
  agentCosts: async (months = 6, monthsOffset = 0): Promise<AwsAgentCostResponse> =>
    (await client.get("/api/v1/govern/cost/agent-costs", { params: { months, months_offset: monthsOffset } })).data,
  commitmentCoverage: async (): Promise<AwsCommitmentCoverage> =>
    (await client.get("/api/v1/govern/cost/commitment-coverage")).data,
  // Usage breakdown and quotas
  usageBreakdown: async (months = 1): Promise<AwsUsageBreakdown> =>
    (await client.get("/api/v1/govern/cost/usage-breakdown", { params: { months } })).data,
  anomalyMonitors: async (): Promise<AwsAnomalyMonitorsResponse> =>
    (await client.get("/api/v1/govern/cost/anomaly-monitors")).data,
  serviceQuotas: async (serviceCode = "bedrock"): Promise<AwsServiceQuotasResponse> =>
    (await client.get("/api/v1/govern/cost/service-quotas", { params: { service_code: serviceCode } })).data,
  bedrockUsage: async (days = 7): Promise<AwsBedrockUsageResponse> =>
    (await client.get("/api/v1/govern/cost/bedrock-usage", { params: { days } })).data,
  agentcoreCosts: async (days = 30): Promise<AwsAgentCostResponse> =>
    (await client.get("/api/v1/govern/cost/agentcore-costs", { params: { days } })).data,
  agentForecast: async (lookbackDays = 30, forecastMonths = 3): Promise<AwsAgentForecastResponse> =>
    (await client.get("/api/v1/govern/cost/agent-forecast", { params: { lookback_days: lookbackDays, forecast_months: forecastMonths } })).data,
  costComparison: async (baseMonthsAgo = 1): Promise<AwsCostComparisonResponse> =>
    (await client.get("/api/v1/govern/cost/cost-comparison", { params: { base_months_ago: baseMonthsAgo } })).data,
  rightsizing: async (service = "AmazonEC2", lookback = "FOURTEEN_DAYS"): Promise<AwsRightsizingResponse> =>
    (await client.get("/api/v1/govern/cost/rightsizing", { params: { service, lookback } })).data,
  dashboardSummary: async (): Promise<AwsFinOpsDashboardSummary> =>
    (await client.get("/api/v1/govern/cost/dashboard-summary")).data,
  serviceQuotasLite: async (serviceCode = "bedrock"): Promise<AwsServiceQuotasResponse> =>
    (await client.get("/api/v1/govern/cost/service-quotas-lite", { params: { service_code: serviceCode } })).data,
  // Savings Plans and RI Recommendations
  savingsPlansRecommendations: async (
    savingsPlansType = "COMPUTE_SP",
    term = "ONE_YEAR",
    paymentOption = "NO_UPFRONT",
    lookback = "THIRTY_DAYS"
  ): Promise<AwsSavingsPlansPurchaseResponse> =>
    (await client.get("/api/v1/govern/cost/savings-plans-recommendations", {
      params: { savings_plans_type: savingsPlansType, term, payment_option: paymentOption, lookback },
    })).data,
  savingsPlansUtilization: async (months = 1): Promise<AwsSavingsPlansUtilizationResponse> =>
    (await client.get("/api/v1/govern/cost/savings-plans-utilization", { params: { months } })).data,
  riRecommendations: async (
    service = "Amazon Elastic Compute Cloud - Compute",
    term = "ONE_YEAR",
    paymentOption = "NO_UPFRONT",
    lookback = "THIRTY_DAYS"
  ): Promise<AwsRIPurchaseResponse> =>
    (await client.get("/api/v1/govern/cost/ri-recommendations", {
      params: { service, term, payment_option: paymentOption, lookback },
    })).data,
  costCategories: async (): Promise<AwsCostCategoriesResponse> =>
    (await client.get("/api/v1/govern/cost/cost-categories")).data,
  /** Per-RESOURCE Bedrock spend for per-agent FinOps attribution. GET /govern/cost/by-resource */
  byResource: async (days = 14): Promise<AwsResourceCostResponse> =>
    (await client.get("/api/v1/govern/cost/by-resource", { params: { days } })).data,
};

// Govern Data Sources API — measured reachability, one real AWS call per source.
//
// There is deliberately no `live: boolean` here. The backend used to send one and
// coerced unknown to true, which let a source report itself connected with no AWS
// call behind it. A boolean also cannot separate "reachable and empty" (counts as
// connected) from "reachable but switched off" (does not), so `status` is the only
// signal the UI may read.
export type DataSourceProbeStatus =
  | 'connected'        // call returned, >= 1 record
  | 'connected_empty'  // call returned, 0 records — still connected
  | 'degraded'         // some sub-calls reached, some failed
  | 'access_denied'    // authorization failure
  | 'not_enabled'      // service not enabled/subscribed in this account
  | 'error'            // throttle, timeout, or unprovisioned resource
  | 'not_probed';      // no probe registered — excluded from BOTH count sides

export interface DataSourceInfo {
  source_id: string;
  group: string;
  label: string;
  status: DataSourceProbeStatus;
  api: string;
  region: string;
  /** Human-readable observation, e.g. "122 models" or "reachable · 0 flows". */
  detail: string | null;
  /** null when the probe did not complete — never coerce this to false. */
  found: boolean | null;
  /** Only set when one call returns the COMPLETE set; a page length is not a total. */
  exact_count: number | null;
  error_code: string | null;
  /** Sanitized: account ids and ARNs are redacted server-side. */
  error: string | null;
  remediation: string;
  latency_ms: number;
  billed_usd: number;
  checked_at: number;
  from_cache: boolean;
  cache_age_s: number;
}

export interface DataSourcesStatus {
  summary: {
    /** The numerator: rows whose status is `connected` OR `connected_empty`.
     *  Deliberately NOT named `connected`, and deliberately not a sibling of the
     *  per-status tallies — a flat `{connected: 43, connected_empty: 7}` invites
     *  a caller to add them, yielding the catalog size and re-creating the
     *  "50/50 connected" overclaim. Row tallies live in `by_status`. */
    reachable: number;
    /** Row count per status. Always carries all 7 keys, 0 included. */
    by_status: Record<DataSourceProbeStatus, number>;
    not_probed: number;
    /** The honest denominator: total - not_probed. */
    probed: number;
    total: number;
    /** True only when every probed source is connected AND nothing is unprobeable. */
    all_connected: boolean;
    verified_at: number | null;
    stale: boolean;
    billed_usd: number;
    regions: { govern: string; control: string; global: string };
  };
  /** Keyed by the catalog source id, so no id-translation table is needed. */
  sources: Record<string, DataSourceInfo>;
  guardrail_sync: {
    last_sync_seconds_ago: number | null;
    sync_interval_seconds: number | null;
  };
}

export const governDataSourcesApi = {
  status: async (): Promise<DataSourcesStatus> =>
    (await client.get("/api/v1/govern/data-sources/status")).data,
  /** OPERATOR-only. Clears the probe cache, so the next status call re-runs the
   *  four billed Cost Explorer probes ($0.04). */
  refresh: async (): Promise<{
    success: boolean;
    caches_cleared: number;
    probe_cache_cleared: number;
    guardrails_synced: number | null;
    error?: string;
  }> => (await client.post("/api/v1/govern/data-sources/refresh")).data,
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

// ─── Govern Macie — live Amazon Macie data-sensitivity (PII/PCI/PHI classification) ───
export interface MacieSensitivityClass { category: string; count: number; color: string; examples: string[]; }
export interface MacieFindingTypeCount { finding_type: string; category: string; count: number; }
export interface MacieSeverityCount { severity: string; count: number; }
export interface MacieSampleFinding { finding_id: string; finding_type: string; category: string; severity?: string | null; title?: string | null; bucket?: string | null; object_extension?: string | null; sensitive_data_types: string[]; created_at?: string | null; }
export interface MacieDataSensitivity { live: boolean; source: string; note?: string | null; macie_status?: string | null; finding_publishing_frequency?: string | null; total_findings: number; classification_findings: number; policy_findings: number; affected_bucket_count: number; classification_breakdown: MacieSensitivityClass[]; by_finding_type: MacieFindingTypeCount[]; by_severity: MacieSeverityCount[]; sample_findings: MacieSampleFinding[]; top_sensitive_types: string[]; setup_guidance?: SetupGuidance | null; }

export const governMacieApi = {
  /** Live Macie data-sensitivity classification counts + affected buckets. GET /govern/macie/data-sensitivity */
  dataSensitivity: async (): Promise<MacieDataSensitivity> =>
    (await client.get("/api/v1/govern/macie/data-sensitivity")).data,
};

// ─── Govern Trusted Advisor — live AWS Trusted Advisor posture (cost/security/limits) ───
export interface TaCategoryRollup { category: string; label: string; total_checks: number; ok: number; warning: number; error: number; not_available: number; flagged_resources: number; }
export interface TaStatusRollup { status: string; count: number; }
export interface TaTopFlaggedCheck { name: string; category: string; status: string; resources_flagged: number; }
export interface TrustedAdvisorSummary { live: boolean; source: string; note?: string | null; total_checks: number; checks_evaluated: number; ok: number; warning: number; error: number; not_available: number; flagged_checks: number; total_flagged_resources: number; estimated_monthly_savings: number; by_category: TaCategoryRollup[]; by_status: TaStatusRollup[]; top_flagged_checks: TaTopFlaggedCheck[]; setup_guidance?: SetupGuidance | null; }

export const governTrustedAdvisorApi = {
  /** Live AWS Trusted Advisor summary rolled up by category + status, top flagged checks. GET /govern/trusted-advisor/summary */
  summary: async (): Promise<TrustedAdvisorSummary> =>
    (await client.get("/api/v1/govern/trusted-advisor/summary")).data,
};

// ─── Govern Service Quotas — AI capacity/throttle limits (Bedrock, SageMaker, AgentCore) ───
export interface GovernAiCapacityQuota {
  service_code: string;
  service_name: string;
  quota_code: string;
  quota_name: string;
  value: number;
  unit: string;
  adjustable: boolean;
  global_quota: boolean;
  category: 'tpm' | 'rpm' | 'rps' | 'tps' | 'tpd' | 'concurrency' | 'throughput' | 'throttle';
  usage_metric_namespace?: string | null;
  usage_metric_name?: string | null;
  has_usage_metric: boolean;
}
export interface GovernAiCapacityQuotasResponse {
  quotas: GovernAiCapacityQuota[];
  total: number;
  by_service: Record<string, number>;
  adjustable_count: number;
  with_usage_metric_count: number;
  services_available: string[];
  services_unavailable: string[];
  truncated: boolean;
  region: string;
  live: boolean;
  source: string;
  note?: string | null;
}

export const governServiceQuotas = {
  /** GET /govern/service-quotas/ai — TPM/RPM/RPS/concurrency/throughput quotas for Bedrock, SageMaker, AgentCore. */
  aiThrottleQuotas: async (): Promise<GovernAiCapacityQuotasResponse> =>
    (await client.get('/api/v1/govern/service-quotas/ai')).data,
};

// ─── Govern Compute Optimizer — live AWS Compute Optimizer right-sizing (FinOps) ───
export interface ComputeOptimizerResourceTypeSummary { resource_type: string; total_analyzed: number; optimized: number; over_provisioned: number; under_provisioned: number; not_optimized: number; idle: number; estimated_monthly_savings: number; savings_percentage: number; savings_currency: string; }
export interface ComputeOptimizerSummary { live: boolean; source: string; note?: string | null; enrollment_status?: string | null; last_updated?: string | null; total_resources_analyzed: number; rightsizing_opportunities: number; over_provisioned: number; under_provisioned: number; optimized: number; not_optimized: number; idle: number; estimated_monthly_savings: number; estimated_annual_savings: number; savings_currency: string; by_resource_type: ComputeOptimizerResourceTypeSummary[]; setup_guidance?: SetupGuidance | null; }

export const governComputeOptimizerApi = {
  /** Live Compute Optimizer right-sizing summary + estimated savings. GET /govern/compute-optimizer/summary */
  summary: async (): Promise<ComputeOptimizerSummary> =>
    (await client.get("/api/v1/govern/compute-optimizer/summary")).data,
};

// ─── Govern Verified Permissions — real Cedar authZ policy stores ───
export interface AwsVerifiedPermissionsStore {
  policy_store_id: string;
  arn?: string | null;            // masked to resource tail (no account id)
  total_policies: number;
  permit_count: number;
  forbid_count: number;
  static_count: number;
  template_linked_count: number;
  schema_present: boolean;
  schema_namespaces: string[];
  identity_source_count: number;
  cedar_version?: string | null;
  validation_mode?: string | null;
  deletion_protection?: string | null;
  created_at?: string | null;
  last_updated_at?: string | null;
}
export interface AwsVerifiedPermissionsStoresResponse {
  stores: AwsVerifiedPermissionsStore[];
  total_stores: number;
  total_policies: number;
  total_permit: number;
  total_forbid: number;
  total_identity_sources: number;
  stores_with_schema: number;
  live: boolean;
  source: string;
  note?: string | null;
}

export const governVerifiedPermissionsApi = {
  /** Real Cedar authZ policy stores — permit/forbid counts, schema, identity sources. GET /govern/verified-permissions/stores */
  stores: async (): Promise<AwsVerifiedPermissionsStoresResponse> =>
    (await client.get("/api/v1/govern/verified-permissions/stores")).data,
};

// ─── Govern AWS Health — real service/account health events (availability + incident correlation) ───
export interface AwsHealthCategoryCount { category: string; count: number; }
export interface AwsHealthEvent {
  service?: string | null;
  region?: string | null;
  event_type_category?: string | null;
  event_type_code?: string | null;
  status_code?: string | null;
  start_time?: string | null;
  last_updated_time?: string | null;
}
export interface AwsHealthEventsResponse {
  window_days: number;
  total_events: number;
  open_issue_count: number;
  by_category: AwsHealthCategoryCount[];
  recent_events: AwsHealthEvent[];
  live: boolean;
  source: string;         // 'aws-health' | 'subscription-required' | 'unavailable-fallback'
  note?: string | null;
}

export const governHealthApi = {
  /** AWS Health service/account events for Operations availability + incident correlation. GET /govern/health/events */
  events: async (days = 30): Promise<AwsHealthEventsResponse> =>
    (await client.get("/api/v1/govern/health/events", { params: { days } })).data,
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

// AWS Config rules compliance (per-rule ComplianceType)
export interface AwsConfigRule { name: string; description?: string | null; compliance: string; noncompliant_resources?: number | null; source?: string | null; }
export interface AwsConfigRulesResponse { rules: AwsConfigRule[]; total: number; compliant: number; noncompliant: number; not_applicable: number; insufficient_data: number; live: boolean; source: string; note?: string | null; }

export const governControlsApi = {
  evaluate: async (controls: ControlEvaluationRequest[]): Promise<EvaluateControlsResponse> =>
    (await client.post("/api/v1/govern/controls/evaluate", { controls })).data,
  /** AWS Config rules + per-rule compliance. GET /controls/config-rules */
  configRules: async (): Promise<AwsConfigRulesResponse> =>
    (await client.get("/api/v1/govern/controls/config-rules")).data,
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
export interface FleetSummaryResponse { summary: FleetSummary; live: boolean; source: string; note?: string | null;  regions?: AwsRegionProvenance | null;}

export interface FleetSegmentRow { key: string; total: number; compliant: number; review_needed: number; blocked: number; critical: number; high: number; pct_compliant: number; }
export interface FleetSegmentsResponse { group_by: string; segments: FleetSegmentRow[]; live: boolean; source: string; note?: string | null;  regions?: AwsRegionProvenance | null;}

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
  regions?: AwsRegionProvenance | null;
}

export interface FleetInventoryRow { key: string; count: number; pct_of_fleet: number; }
export interface FleetInventoryResponse { by_model: FleetInventoryRow[]; by_provider: FleetInventoryRow[]; live: boolean; source: string; note?: string | null;  regions?: AwsRegionProvenance | null;}

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
  /**
   * Pass rate over ASSESSED controls only (pass_count / assessed_count), NOT coverage of
   * total_controls. 2 of 16 controls assessed and both passing reports 100 here. Never
   * render this without assessed_count beside it; for true coverage use assessed_pct.
   */
  coverage_pct: number;
  /** Denominator of coverage_pct: controls carrying a non not-started attestation. */
  assessed_count?: number;
  /** True coverage: assessed_count / total_controls. */
  assessed_pct?: number;
  last_updated?: string;
}

export interface CompliancePosture {
  frameworks: FrameworkSummary[];
  /**
   * Pooled pass rate over ASSESSED controls only (total_pass / total_assessed), NOT
   * coverage of the estate. Use overall_assessed_pct for coverage.
   */
  overall_coverage_pct: number;
  total_controls: number;
  total_pass: number;
  /** Controls attested FAIL. Not-started controls are not gaps, so 0 != clean. */
  total_gaps: number;
  /** Denominator of overall_coverage_pct. */
  total_assessed?: number;
  total_not_assessed?: number;
  /** True coverage: total_assessed / total_controls. */
  overall_assessed_pct?: number;
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

  /**
   * Update a control attestation.
   *
   * `updatedBy` is optional and normally omitted: when it is absent the param is not
   * sent, and the backend attributes the write to the `x-user-email` header the request
   * interceptor above already attaches (see line ~46), falling back to `"unknown"`.
   *
   * It used to default to `'user'`, and no call site ever passed it, so that literal was
   * the attribution stamped on every hand-entered row of the attestation table. Pass a
   * value here only for a caller that genuinely knows an identity the header does not
   * carry - not to fill the field in.
   */
  updateAttestation: async (
    frameworkId: string,
    controlId: string,
    update: ControlAttestationUpdate,
    updatedBy?: string
  ): Promise<ControlAttestation> =>
    (await client.put(
      `/api/v1/govern/compliance/frameworks/${frameworkId}/controls/${controlId}`,
      update,
      { params: { updated_by: updatedBy } }
    )).data,

  /** Add evidence to a control. Attribution works as in `updateAttestation` above. */
  addEvidence: async (
    frameworkId: string,
    controlId: string,
    evidence: EvidenceCreate,
    uploadedBy?: string
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
  // Matches Pydantic UsageAnomaly
  anomaly_type: string; // spend-spike | runaway-loop | burst | unusual-hours
  severity: 'critical' | 'high' | 'medium' | 'low';
  user_id?: string | null;
  team_id?: string | null;
  description: string;
  detected_at: string;
  metric_value: number;
  baseline_value: number;
  deviation_factor: number;
  window_start?: string | null;
  window_end?: string | null;
}

export interface ShadowAiUnapprovedUser {
  email: string;
  first_seen: string;
  /** null when no Bedrock invocation-log token count could be measured for this
   *  identity. A measured 0 is a real 0 — never coerce null to 0, and never render
   *  it as one. */
  tokens: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
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
  /** null when the model has no published rate in MODEL_COSTS or no measured
   *  tokens. There is no longer a `default` rate to fall back on, so an unpriced
   *  model must render as unknown, not as $0.00. */
  cost: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  evidence: string;
  recommended_action: string;
}

export interface ShadowAiDetection {
  unapproved_users: ShadowAiUnapprovedUser[];
  unknown_tools: ShadowAiUnknownTool[];
  unapproved_models: ShadowAiUnapprovedModel[];
  total_shadow_events: number;
  shadow_cost_estimate: number;
  live: boolean;
  source: string;
  note?: string | null;
}

export interface DeveloperAiUsageResponse {
  // Flat fields from backend (matches Pydantic DeveloperUsageResponse)
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  total_sessions: number;
  active_users: number;
  by_user: Array<{
    user_id: string;
    email?: string | null;
    team_id?: string | null;
    department?: string | null;
    cost_center?: string | null;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    total_cost_usd: number;
    session_count: number;
    last_active?: string | null;
  }>;
  by_team: Array<{
    team_id: string;
    department?: string | null;
    cost_center?: string | null;
    user_count: number;
    total_tokens: number;
    total_cost_usd: number;
    session_count: number;
  }>;
  trend: Array<{
    date: string;
    input_tokens: number;
    output_tokens: number;
    total_cost_usd: number;
    session_count: number;
    user_count: number;
  }>;
  period_start: string;
  period_end: string;
  shadow_ai?: ShadowAiDetection | null;
  live: boolean;
  source: string;
  note?: string | null;
}

/** Local agent config discovered in a repository. */
export interface LocalAgentConfig {
  repo_name: string;
  repo_arn?: string | null;
  file_path: string;
  tool: string;
  owner?: string | null;
  team?: string | null;
  last_modified?: string | null;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  description?: string | null;
  file_size_bytes: number;
  content_preview?: string | null;
}

/** Summary of discovered agents by tool type. */
export interface LocalAgentToolSummary {
  tool: string;
  file_pattern: string;
  count: number;
  icon: string;
}

/** Response from local agent discovery endpoint. */
export interface LocalAgentDiscoveryResponse {
  agents: LocalAgentConfig[];
  total_found: number;
  by_tool: LocalAgentToolSummary[];
  repos_scanned: number;
  repos_with_agents: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  live: boolean;
  source: string;
  note?: string | null;
}

// ─── AI tool provenance ───
// Where an AI tool call went, and how the tool got installed. Both classifications carry
// an explicit unknown, and `unknown` is a measurement, not a gap to fill with the
// safe-looking bucket. Read every count against `coverage`.

/** A measured fraction of the estate, denominator retained. */
export interface CoverageRatio {
  covered: number;
  total: number;
  label: string;
  unit: string;
  /** null when total is 0 — "nothing to cover" is not the same as "0% covered". */
  pct: number | null;
  /** True only when a real denominator is fully covered. */
  complete: boolean;
  note?: string | null;
}

export interface ProvenanceCoverage {
  endpoint: CoverageRatio;
  dns: CoverageRatio;
  call_path: CoverageRatio;
  package_inventory: CoverageRatio;
  /** Callers that resolved to no host. A complete `endpoint` ratio beside a non-zero
   *  value here does NOT mean the observed callers are covered — that ratio counts EC2. */
  unattributed_callers: number;
  /** Plain statements of what this signal set cannot answer. Render verbatim. */
  blind_spots: string[];
}

export type CallPath = 'bedrock' | 'public_api' | 'unknown';
export type InstallProvenance = 'managed' | 'managed_runtime' | 'self_installed' | 'unknown_host';
export type ToolClass = 'coding_tool' | 'sdk_caller' | 'unidentified';

export interface AiToolProvenanceRecord {
  principal: string;
  tool: string;
  version?: string | null;
  icon: string;
  tool_class: ToolClass;
  call_path: CallPath;
  install_provenance: InstallProvenance;
  provider?: string | null;
  /** AWS-managed runtime the caller ran in (Lambda, Fargate, AgentCore), when detectable. */
  exec_env?: string | null;
  host_id?: string | null;
  source_ip?: string | null;
  user_agent?: string | null;
  requests: number;
  models: string[];
  first_seen?: string | null;
  last_seen?: string | null;
  governed: boolean;
  needs_attention: boolean;
  tool_evidence: string;
  call_path_evidence: string;
  install_evidence: string;
  host_evidence: string;
}

export interface AiToolProvenanceResponse {
  records: AiToolProvenanceRecord[];
  total_records: number;
  by_call_path: Record<string, number>;
  by_install_provenance: Record<string, number>;
  by_tool_class: Record<string, number>;
  coding_tool_count: number;
  needs_attention_count: number;
  calls_observed: number;
  window_days: number;
  coverage?: ProvenanceCoverage | null;
  live: boolean;
  source: string;
  note?: string | null;
}

export const governDeveloperAiApi = {
  /** Get developer AI usage totals, team/user breakdown, trend, and shadow AI detection. */
  usage: async (days = 30): Promise<DeveloperAiUsageResponse> =>
    (await client.get('/api/v1/govern/developer-ai/usage', { params: { days } })).data,

  /** Get anomaly alerts for developer AI usage. */
  anomalies: async (days = 7): Promise<{ anomalies: DeveloperAiAnomaly[]; live: boolean; source: string; note?: string | null }> =>
    // The route takes `hours` (max 720 = 30d, the widest UI selector); convert so the window actually applies.
    (await client.get('/api/v1/govern/developer-ai/anomalies', { params: { hours: Math.min(720, Math.max(1, Math.round(days * 24))) } })).data,

  /** Get shadow AI detection results. */
  shadowAi: async (): Promise<{ shadow_ai: ShadowAiDetection; live: boolean; source: string; note?: string | null }> =>
    (await client.get('/api/v1/govern/developer-ai/shadow-ai')).data,

  /** Discover local AI agent configs in CodeCommit repositories. */
  localAgents: async (limit = 100): Promise<LocalAgentDiscoveryResponse> =>
    (await client.get('/api/v1/govern/developer-ai/local-agents', { params: { limit } })).data,

  /**
   * AI tool provenance: call path (bedrock / public_api / unknown) and install source
   * (managed / self_installed / unknown_host) per observed caller-tool pair, with the
   * coverage denominators that say how much of the estate the answer covers.
   *
   * `public_api` needs Route 53 Resolver query logging. Without it a tool calling a
   * vendor endpoint produces NO record, so a zero there is not evidence of absence —
   * check `coverage.dns` before reading the count.
   */
  aiToolProvenance: async (days = 7): Promise<AiToolProvenanceResponse> =>
    (await client.get('/api/v1/govern/developer-ai/provenance', { params: { days } })).data,

  /** Get list of governance policies. */
  policies: async (): Promise<PolicyListResponse> =>
    (await client.get('/api/v1/govern/developer-ai/policies')).data,

  /** Get a specific policy. */
  policy: async (policyId: string): Promise<AgentPolicy> =>
    (await client.get(`/api/v1/govern/developer-ai/policies/${policyId}`)).data,

  /** Evaluate activity against a policy. */
  evaluatePolicy: async (policyId: string, days = 7): Promise<PolicyEvaluationResult> =>
    (await client.get(`/api/v1/govern/developer-ai/policies/${policyId}/evaluate`, { params: { days } })).data,

  /** Update a policy. */
  updatePolicy: async (policyId: string, update: PolicyUpdateRequest): Promise<AgentPolicy> =>
    (await client.patch(`/api/v1/govern/developer-ai/policies/${policyId}`, update)).data,

  /** Get cost attribution breakdown. */
  costAttribution: async (days = 7): Promise<CostAttributionResponse> =>
    (await client.get('/api/v1/govern/developer-ai/cost-attribution', { params: { days } })).data,
};

/** Governance policy for agentic coding. */
export interface AgentPolicy {
  id: string;
  name: string;
  description?: string | null;
  approved_tools: string[];
  blocked_tools: string[];
  review_tools: string[];
  approved_models: string[];
  blocked_models: string[];
  approved_users: string[];
  blocked_users: string[];
  max_requests_per_hour: number;
  max_daily_cost_usd: number;
  require_guardrails: boolean;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

/** Policy violation. */
export interface PolicyViolation {
  id: string;
  violation_type: 'tool' | 'model' | 'user' | 'rate' | 'cost';
  severity: 'low' | 'medium' | 'high' | 'critical';
  user: string;
  tool?: string | null;
  model?: string | null;
  rule_matched: string;
  policy_status: 'approved' | 'blocked' | 'review';
  request_count: number;
  first_seen: string;
  last_seen: string;
  action_taken?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  resolution?: string | null;
}

/** Result of policy evaluation. */
export interface PolicyEvaluationResult {
  policy_id: string;
  policy_name: string;
  total_evaluated: number;
  approved_count: number;
  blocked_count: number;
  review_count: number;
  violations: PolicyViolation[];
  violations_by_type: Record<string, number>;
  violations_by_severity: Record<string, number>;
  live: boolean;
  source: string;
  note?: string | null;
}

/** List of policies response. */
export interface PolicyListResponse {
  policies: AgentPolicy[];
  active_policy_id?: string | null;
  live: boolean;
  source: string;
}

/** Policy update request. */
export interface PolicyUpdateRequest {
  name?: string;
  description?: string;
  approved_tools?: string[];
  blocked_tools?: string[];
  review_tools?: string[];
  approved_models?: string[];
  blocked_models?: string[];
  approved_users?: string[];
  blocked_users?: string[];
  max_requests_per_hour?: number;
  max_daily_cost_usd?: number;
  require_guardrails?: boolean;
  is_active?: boolean;
}

/** Cost breakdown by tool. */
export interface CostByTool {
  tool: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  users: number;
}

/** Cost breakdown by user. */
export interface CostByUser {
  user: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  tools: string[];
  models: string[];
}

/** Cost breakdown by model.
 *  All three measured fields are nullable and MUST be distinguished from zero:
 *  a model with no invocation-log match has *unmeasured* tokens (`null`), while a
 *  model with `requests: 0` has a genuine measured zero. The two are otherwise
 *  indistinguishable, which is exactly why these are Optional rather than
 *  defaulted to 0. */
export interface CostByModel {
  model: string;
  requests: number;
  input_tokens: number | null;
  output_tokens: number | null;
  /** null when the model has no published rate or no measured tokens. */
  estimated_cost_usd: number | null;
  users: number;
}

/** Daily cost trend. */
export interface CostTrend {
  date: string;
  requests: number;
  estimated_cost_usd: number;
}

/** Cost attribution response. */
export interface CostAttributionResponse {
  period_days: number;
  total_requests: number;
  total_estimated_cost_usd: number;
  by_tool: CostByTool[];
  by_user: CostByUser[];
  by_model: CostByModel[];
  trend: CostTrend[];
  live: boolean;
  source: string;
  note?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// AI-DLC (AI-Driven Development Life Cycle) Types
// ═══════════════════════════════════════════════════════════════════════════

/** AI-DLC workflow stage. */
export interface AidlcStage {
  id: string;
  name: string;
  phase: 'inception' | 'construction' | 'operations';
  execution: 'always' | 'conditional';
  description: string;
}

/** AI-DLC project progress by phase. */
export interface AidlcProjectProgress {
  inception: number;
  construction: number;
  operations: number;
}

/** AI-DLC project. */
export interface AidlcProject {
  id: string;
  name: string;
  repository: string;
  current_phase: 'inception' | 'construction' | 'operations';
  current_stage: string;
  status: 'active' | 'paused' | 'completed' | 'blocked';
  last_activity: string;
  enabled_extensions: string[];
  progress: AidlcProjectProgress;
  violations: number;
  pending_approvals: number;
  team_members: string[];
}

/** AI-DLC extension (rule set). */
export interface AidlcExtension {
  id: string;
  name: string;
  category: 'security' | 'testing' | 'resiliency' | 'custom';
  rule_count: number;
  description: string;
  opt_in: boolean;
  blocking: boolean;
}

/** AI-DLC rule. */
export interface AidlcRule {
  id: string;
  extension_id: string;
  title: string;
  statement: string;
  verification_criteria: string[];
}

/** AI-DLC finding/violation. */
export interface AidlcFinding {
  id: string;
  project_id: string;
  rule_id: string;
  stage: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'resolved' | 'waived';
  message: string;
  file?: string | null;
  line?: number | null;
  detected_at: string;
  resolved_at?: string | null;
}

/** AI-DLC code quality metrics. */
export interface AidlcCodeQuality {
  linting_score: number;
  security_score: number;
  duplication_pct: number;
}

/** AI-DLC test results. */
export interface AidlcTestResults {
  pass_rate: number;
  coverage_pct: number;
  total_tests: number;
}

/** AI-DLC NFR compliance. */
export interface AidlcNfrCompliance {
  token_consumption: number;
  execution_time_ms: number;
  cross_model_consistency: number;
}

/** AI-DLC evaluator metrics. */
export interface AidlcEvaluatorMetrics {
  project_id: string;
  timestamp: string;
  code_quality: AidlcCodeQuality;
  test_results: AidlcTestResults;
  nfr_compliance: AidlcNfrCompliance;
  semantic_score: number;
  overall_score: number;
}

/** AI-DLC audit log entry. */
export interface AidlcAuditEntry {
  id: string;
  project_id: string;
  timestamp: string;
  stage: string;
  action: 'stage-started' | 'stage-completed' | 'approval-requested' | 'approval-granted' | 'approval-rejected' | 'finding-detected' | 'finding-resolved';
  user?: string | null;
  details: string;
}

/** AI-DLC API responses. */
export interface AidlcStagesResponse {
  stages: AidlcStage[];
}

export interface AidlcExtensionsResponse {
  extensions: AidlcExtension[];
}

export interface AidlcRulesResponse {
  extension_id: string;
  rules: AidlcRule[];
}

export interface AidlcProjectsResponse {
  projects: AidlcProject[];
  total: number;
  live: boolean;
  source: string;
}

export interface AidlcFindingsResponse {
  findings: AidlcFinding[];
  total: number;
  by_severity: Record<string, number>;
  by_status: Record<string, number>;
  live: boolean;
  source: string;
}

export interface AidlcMetricsResponse {
  metrics: AidlcEvaluatorMetrics[];
  live: boolean;
  source: string;
}

export interface AidlcAuditResponse {
  entries: AidlcAuditEntry[];
  total: number;
  live: boolean;
  source: string;
}

/** AI-DLC harness types. */
export type AidlcHarnessType = 'claude-code' | 'kiro-ide' | 'kiro-cli' | 'codex-cli' | 'opencode' | 'q-desktop' | 'cursor' | 'copilot' | 'unknown';

/** Detection source for harness discovery. */
export type DetectionSource = 'cloudtrail' | 'config_file' | 'git_commit' | 'ide_telemetry';

/** AI-DLC harness instance (per user). */
export interface AidlcHarnessInstance {
  harness_type: AidlcHarnessType;
  user: string;
  version?: string | null;
  last_seen: string;
  request_count: number;
  models_used: string[];
  config_path?: string | null;
  last_commit_sha?: string | null;
  detection_method: 'cloudtrail' | 'config_file' | 'git_commit';
  detection_sources: DetectionSource[];
  detection_confidence: number;
}

/** AI-DLC harness aggregate stats. */
export interface AidlcHarnessStats {
  harness_type: AidlcHarnessType;
  display_name: string;
  user_count: number;
  total_requests: number;
  versions_seen: string[];
  last_activity?: string | null;
  detection_sources: DetectionSource[];
}

/** AI-DLC harness discovery response. */
export interface AidlcHarnessResponse {
  harnesses: AidlcHarnessStats[];
  instances: AidlcHarnessInstance[];
  total_users: number;
  total_requests: number;
  live: boolean;
  source: string;
  sources_used: DetectionSource[];
}

// ---------------------------------------------------------------------------
// Harness Backend Sandboxing Types
// ---------------------------------------------------------------------------

/** Harness backend types. */
export type HarnessBackend = 'cli' | 'sdk' | 'bedrock' | 'openai' | 'azure' | 'vertex';

/** Backend capabilities and restrictions. */
export interface BackendCapabilities {
  backend: HarnessBackend;
  allowed_tools: string[];
  blocked_tools: string[];
  can_write: boolean;
  can_execute: boolean;
  max_context_tokens: number;
  supports_streaming: boolean;
  supports_tool_use: boolean;
  requires_human_approval_for: string[];
  supports_mcp: boolean;
  supports_agents: boolean;
}

/** Response with all backend capabilities. */
export interface BackendCapabilitiesResponse {
  backends: BackendCapabilities[];
  standard_tools: string[];
}

/** Response with allowed tools for a backend. */
export interface BackendToolsResponse {
  backend: HarnessBackend;
  allowed_tools: string[];
  blocked_tools: string[];
  requires_approval: string[];
}

/** Tool validation result. */
export interface BackendToolValidation {
  allowed: boolean;
  reason: string;
  requires_approval: boolean;
}

/** Backend comparison response. */
export interface BackendComparisonResponse {
  backends: BackendCapabilities[];
  tool_matrix: Record<string, Record<string, 'allowed' | 'blocked' | 'approval' | 'not_available'>>;
}

/** Backend detection result. */
export interface BackendDetectionResult {
  backend: HarnessBackend;
  confidence: number;
  user_agent: string;
}

/** AI-DLC API. */
export const governAidlcApi = {
  /** Get AI-DLC workflow stages. */
  stages: async (): Promise<AidlcStagesResponse> =>
    (await client.get('/api/v1/govern/aidlc/stages')).data,

  /** Get available extensions. */
  extensions: async (): Promise<AidlcExtensionsResponse> =>
    (await client.get('/api/v1/govern/aidlc/extensions')).data,

  /** Get rules for an extension. */
  rules: async (extensionId: string): Promise<AidlcRulesResponse> =>
    (await client.get(`/api/v1/govern/aidlc/extensions/${extensionId}/rules`)).data,

  /** Discover AI-DLC projects. */
  projects: async (limit = 50): Promise<AidlcProjectsResponse> =>
    (await client.get('/api/v1/govern/aidlc/projects', { params: { limit } })).data,

  /** Get findings/violations. */
  findings: async (projectId?: string, limit = 100): Promise<AidlcFindingsResponse> =>
    (await client.get('/api/v1/govern/aidlc/findings', { params: { project_id: projectId, limit } })).data,

  /** Get evaluator metrics. */
  metrics: async (projectId?: string): Promise<AidlcMetricsResponse> =>
    (await client.get('/api/v1/govern/aidlc/metrics', { params: { project_id: projectId } })).data,

  /** Get audit log. */
  audit: async (projectId?: string, limit = 100): Promise<AidlcAuditResponse> =>
    (await client.get('/api/v1/govern/aidlc/audit', { params: { project_id: projectId, limit } })).data,

  /** Discover deployed harnesses.
   * @param days - Number of days of history to scan (default 7)
   * @param sources - Optional comma-separated list of detection sources: cloudtrail,config_file,git_commit
   */
  harnesses: async (days = 7, sources?: string): Promise<AidlcHarnessResponse> =>
    (await client.get('/api/v1/govern/aidlc/harnesses', { params: { days, source: sources } })).data,

  /** Get kill-switch status. */
  killswitchStatus: async (): Promise<KillswitchStatusResponse> =>
    (await client.get('/api/v1/govern/aidlc/killswitch-status')).data,

  /** Update kill-switch (ADMIN only). */
  updateKillswitch: async (disabled: boolean, reason?: string): Promise<KillswitchUpdateResponse> =>
    (await client.post('/api/v1/govern/aidlc/killswitch', { disabled, reason })).data,

  /** Get all backend capabilities. */
  backends: async (): Promise<BackendCapabilitiesResponse> =>
    (await client.get('/api/v1/govern/aidlc/backends')).data,

  /** Get backend comparison matrix. */
  backendComparison: async (): Promise<BackendComparisonResponse> =>
    (await client.get('/api/v1/govern/aidlc/backends/comparison')).data,

  /** Get allowed tools for a specific backend. */
  backendTools: async (backend: HarnessBackend): Promise<BackendToolsResponse> =>
    (await client.get(`/api/v1/govern/aidlc/backends/${backend}/tools`)).data,

  /** Validate a tool operation for a backend. */
  validateBackendOperation: async (backend: HarnessBackend, toolName: string, isWrite = false): Promise<BackendToolValidation> =>
    (await client.get(`/api/v1/govern/aidlc/backends/${backend}/validate`, {
      params: { tool_name: toolName, is_write: isWrite },
    })).data,

  /** Detect backend type from userAgent. */
  detectBackend: async (userAgent: string): Promise<BackendDetectionResult> =>
    (await client.get('/api/v1/govern/aidlc/backends/detect', { params: { user_agent: userAgent } })).data,
};

// ---------------------------------------------------------------------------
// Kill-switch types
// ---------------------------------------------------------------------------

/** Kill-switch status response. */
export interface KillswitchStatusResponse {
  disabled: boolean;
  source: 'env_var' | 'sentinel_file' | 'dynamodb' | 'none';
  reason?: string | null;
  disabled_at?: string | null;
  disabled_by?: string | null;
  env_var_active: boolean;
  sentinel_file_active: boolean;
}

/** Kill-switch update response. */
export interface KillswitchUpdateResponse {
  success: boolean;
  status: KillswitchStatusResponse;
  message: string;
}

// ---------------------------------------------------------------------------
// Govern Validation Panel — Adversarial validation for harness governance (VVAH)
// ---------------------------------------------------------------------------

/** Validation persona types. */
export type ValidationPersona = 'security_architect' | 'penetration_tester' | 'compliance_reviewer' | 'cross_repo_analyzer';

/** Target types for validation. */
export type ValidationTargetType = 'harness_action' | 'code_change' | 'policy_change';

/** Persona verdict options. */
export type PersonaVerdict = 'approve' | 'reject' | 'needs_review';

/** Final panel verdict. */
export type PanelVerdict = 'validated' | 'validation_failed' | 'needs_review';

/** Validation criterion with weight and scoring. */
export interface ValidationCriterion {
  name: string;
  label: string;
  weight: number;
  is_critical: boolean;
  score: number | null;
  rationale: string | null;
}

/** Finding from a single persona. */
export interface PersonaFinding {
  persona: ValidationPersona;
  verdict: PersonaVerdict;
  confidence: number;
  findings: string[];
  recommendations: string[];
  submitted_at: string;
  submitted_by: string | null;
}

/** Complete validation panel. */
export interface ValidationPanel {
  panel_id: string;
  target_type: ValidationTargetType;
  target_id: string;
  target_description: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  finalized_at: string | null;
  finalized_by: string | null;
  criteria: ValidationCriterion[];
  persona_findings: PersonaFinding[];
  /**
   * Weighted score over SCORED criteria only. null = no criterion was scored, so there
   * is no score. Render as "not scored", never as 0 — the backend used to impute the
   * persona average into unscored criteria and report a confident 90% for a panel where
   * nothing had been assessed.
   */
  weighted_score: number | null;
  /** Fail-closed: false when any critical criterion is unscored. */
  critical_gates_passed: boolean | null;
  final_verdict: PanelVerdict | null;
  /** Coverage of the verdict — 2 of 4 criteria is a different claim from 4 of 4. */
  scored_criteria: number;
  total_criteria: number;
  /** Critical criteria nobody scored. Non-empty means the panel cannot validate. */
  unscored_critical_criteria: string[];
  /** Confidence-weighted persona opinion, reported as its own signal — NOT a criterion score. */
  persona_consensus_score: number | null;
}

/** Request to create a validation panel. */
export interface ValidationPanelCreateRequest {
  target_type: ValidationTargetType;
  target_id: string;
  target_description?: string;
}

/** Request to submit a persona finding. */
export interface ValidationPanelFindingRequest {
  persona: ValidationPersona;
  verdict: PersonaVerdict;
  confidence: number;
  findings: string[];
  recommendations: string[];
}

/** Govern Validation Panel API. */
export const governValidationApi = {
  /** Create a new validation panel. */
  createPanel: async (req: ValidationPanelCreateRequest): Promise<ValidationPanel> =>
    (await client.post('/api/v1/govern/validation/panels', req)).data,

  /** List validation panels. */
  listPanels: async (targetType?: ValidationTargetType, finalizedOnly = false, limit = 100): Promise<ValidationPanel[]> =>
    (await client.get('/api/v1/govern/validation/panels', {
      params: { target_type: targetType, finalized_only: finalizedOnly, limit },
    })).data,

  /** Get a validation panel by ID. */
  getPanel: async (panelId: string): Promise<ValidationPanel> =>
    (await client.get(`/api/v1/govern/validation/panels/${panelId}`)).data,

  /** Submit a persona finding. */
  submitFinding: async (panelId: string, req: ValidationPanelFindingRequest): Promise<ValidationPanel> =>
    (await client.post(`/api/v1/govern/validation/panels/${panelId}/findings`, req)).data,

  /** Finalize the panel verdict (ADMIN only). */
  finalizePanel: async (panelId: string): Promise<ValidationPanel> =>
    (await client.post(`/api/v1/govern/validation/panels/${panelId}/finalize`)).data,

  /** Update a criterion score. */
  updateCriterionScore: async (panelId: string, criterionName: string, score: number, rationale?: string): Promise<ValidationPanel> =>
    (await client.put(`/api/v1/govern/validation/panels/${panelId}/criteria/${criterionName}`, null, {
      params: { score, rationale },
    })).data,

  /** Delete a validation panel (ADMIN only). */
  deletePanel: async (panelId: string): Promise<ValidationPanel> =>
    (await client.delete(`/api/v1/govern/validation/panels/${panelId}`)).data,
};

// ---------------------------------------------------------------------------
// Harness Policy types
// ---------------------------------------------------------------------------

/** Tool access tier for harnesses. */
export type ToolTier = 'read_only' | 'read_write' | 'full';

/** Phase of harness workflow affecting tool access. */
export type HarnessPhase = 'discovery' | 'build' | 'validation';

/** Policy defining tool access and constraints for an AI harness. */
export interface HarnessPolicy {
  policy_id: string;
  harness_type: string;
  display_name: string;
  description?: string | null;
  allowed_tier: ToolTier;
  allowed_tools: string[];
  blocked_tools: string[];
  allowed_paths: string[];
  blocked_paths: string[];
  max_output_size_kb: number;
  max_file_size_kb: number;
  require_human_approval: boolean;
  approval_required_for: string[];
  enabled: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

/** Request to create a new harness policy. */
export interface HarnessPolicyCreate {
  harness_type: string;
  display_name?: string | null;
  description?: string | null;
  allowed_tier?: ToolTier;
  allowed_tools?: string[] | null;
  blocked_tools?: string[] | null;
  allowed_paths?: string[] | null;
  blocked_paths?: string[] | null;
  max_output_size_kb?: number;
  max_file_size_kb?: number;
  require_human_approval?: boolean;
  approval_required_for?: string[] | null;
}

/** Request to update a harness policy. */
export interface HarnessPolicyUpdate {
  display_name?: string | null;
  description?: string | null;
  allowed_tier?: ToolTier | null;
  allowed_tools?: string[] | null;
  blocked_tools?: string[] | null;
  allowed_paths?: string[] | null;
  blocked_paths?: string[] | null;
  max_output_size_kb?: number | null;
  max_file_size_kb?: number | null;
  require_human_approval?: boolean | null;
  approval_required_for?: string[] | null;
  enabled?: boolean | null;
}

/** Result of evaluating tool access for a harness. */
export interface ToolAccessEvaluation {
  allowed: boolean;
  reason: string;
  harness_type: string;
  tool_name: string;
  target_path?: string | null;
  requires_approval: boolean;
  tier_required?: ToolTier | null;
  policy_tier?: ToolTier | null;
}

/** Response containing list of harness policies. */
export interface HarnessPolicyListResponse {
  policies: HarnessPolicy[];
  total: number;
  live: boolean;
  source: string;
  note?: string | null;
}

/** Summary of tools available at each tier. */
export interface ToolTierSummary {
  tier: ToolTier;
  label: string;
  tools: string[];
  description: string;
}

/** Response with tier breakdown information. */
export interface TierBreakdownResponse {
  tiers: ToolTierSummary[];
  blocked_paths_default: string[];
}

/** Harness Policy API. */
export const governHarnessPolicyApi = {
  /** List all harness policies. */
  list: async (): Promise<HarnessPolicyListResponse> =>
    (await client.get('/api/v1/govern/harness-policy/policies')).data,

  /** Get tier breakdown. */
  tiers: async (): Promise<TierBreakdownResponse> =>
    (await client.get('/api/v1/govern/harness-policy/tiers')).data,

  /** Get policy for a harness type. */
  get: async (harnessType: string, phase?: HarnessPhase): Promise<HarnessPolicy> =>
    (await client.get(`/api/v1/govern/harness-policy/${harnessType}`, { params: { phase } })).data,

  /** Create a new policy. */
  create: async (request: HarnessPolicyCreate): Promise<HarnessPolicy> =>
    (await client.post('/api/v1/govern/harness-policy/policies', request)).data,

  /** Update a policy. */
  update: async (harnessType: string, update: HarnessPolicyUpdate): Promise<HarnessPolicy> =>
    (await client.put(`/api/v1/govern/harness-policy/${harnessType}`, update)).data,

  /** Delete a custom policy. */
  delete: async (harnessType: string): Promise<{ status: string; harness_type: string; message: string }> =>
    (await client.delete(`/api/v1/govern/harness-policy/${harnessType}`)).data,

  /** Evaluate tool access. */
  evaluate: async (
    harnessType: string,
    toolName: string,
    targetPath?: string,
    phase?: HarnessPhase
  ): Promise<ToolAccessEvaluation> =>
    (await client.post(`/api/v1/govern/harness-policy/${harnessType}/evaluate`, null, {
      params: { tool_name: toolName, target_path: targetPath, phase }
    })).data,

  /** Get allowed tools for a harness. */
  allowedTools: async (harnessType: string, phase?: HarnessPhase): Promise<string[]> =>
    (await client.get(`/api/v1/govern/harness-policy/${harnessType}/allowed-tools`, { params: { phase } })).data,
};

// ---------------------------------------------------------------------------
// Govern Harness Audit — VVAH-pattern audit artifacts for harness governance
// ---------------------------------------------------------------------------

/** Harness action types. */
export type HarnessActionType = 'discovery' | 'invocation' | 'tool_use' | 'validation';

/** Harness governance verdict. */
export type HarnessVerdict = 'allowed' | 'blocked' | 'needs_review';

/** Harness audit artifact. */
export interface HarnessAuditArtifact {
  artifact_id: string;
  harness_type: string;
  action_type: HarnessActionType;
  timestamp: string;
  user_identity: string;
  session_id?: string | null;
  model_id?: string | null;
  tool_name?: string | null;
  target_path?: string | null;
  input_hash?: string | null;
  output_hash?: string | null;
  duration_ms: number;
  token_count?: number | null;
  policy_evaluation?: Record<string, unknown> | null;
  gates_passed: string[];
  gates_failed: string[];
  verdict: HarnessVerdict;
}

/** Harness run summary statistics. */
export interface HarnessRunSummary {
  total_artifacts: number;
  by_action_type: Record<string, number>;
  by_verdict: Record<string, number>;
  total_duration_ms: number;
  total_tokens: number;
  gates_passed: number;
  gates_failed: number;
}

/** Harness run manifest. */
export interface HarnessRunManifest {
  run_id: string;
  harness_type: string;
  harness_version: string;
  started_at: string;
  completed_at?: string | null;
  user_identity: string;
  config_hash: string;
  git_sha?: string | null;
  artifacts: string[];
  summary: HarnessRunSummary;
}

/** Harness run manifest with full artifact details. */
export interface HarnessRunManifestWithArtifacts extends HarnessRunManifest {
  artifact_details: HarnessAuditArtifact[];
}

/** Harness Audit API. */
export const governHarnessAuditApi = {
  /** List recent harness runs. */
  listRuns: async (limit = 100): Promise<HarnessRunManifest[]> =>
    (await client.get('/api/v1/govern/harness-audit/runs', { params: { limit } })).data,

  /** Get a harness run with all artifacts. */
  getRun: async (runId: string): Promise<HarnessRunManifestWithArtifacts> =>
    (await client.get(`/api/v1/govern/harness-audit/runs/${runId}`)).data,

  /** Get a single artifact. */
  getArtifact: async (artifactId: string, runId?: string): Promise<HarnessAuditArtifact> =>
    (await client.get(`/api/v1/govern/harness-audit/artifacts/${artifactId}`, { params: { run_id: runId } })).data,

  /** List all artifacts for a run. */
  listRunArtifacts: async (runId: string): Promise<HarnessAuditArtifact[]> =>
    (await client.get(`/api/v1/govern/harness-audit/runs/${runId}/artifacts`)).data,
};

// ---------------------------------------------------------------------------
// Govern Policy Drift - Policy-reality drift detection
// ---------------------------------------------------------------------------

/** Drift type enum. */
export type DriftType = 'tier_violation' | 'path_violation' | 'unknown_harness';

/** Drift severity enum. */
export type DriftSeverity = 'critical' | 'high' | 'medium' | 'low';

/** CloudTrail evidence for a drift finding. */
export interface CloudTrailEvidence {
  event_id: string;
  event_name: string;
  event_source: string;
  event_time?: string | null;
  username?: string | null;
  user_agent?: string | null;
  request_params?: Record<string, unknown> | null;
  error_code?: string | null;
}

/** A single policy drift finding. */
export interface PolicyDriftFinding {
  finding_id: string;
  drift_type: DriftType;
  severity: DriftSeverity;
  policy_id: string;
  harness_type: string;
  expected: string;
  actual: string;
  evidence: CloudTrailEvidence;
  detected_at: string;
  resolved: boolean;
  resolved_at?: string | null;
  resolved_by?: string | null;
  resolution_note?: string | null;
}

/** Drift counts by severity. */
export interface DriftCountBySeverity {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

/** Drift counts by type. */
export interface DriftCountByType {
  tier_violation: number;
  path_violation: number;
  unknown_harness: number;
}

/** Worst offender entry. */
export interface WorstOffender {
  identity: string;
  identity_type: string;
  finding_count: number;
  critical_count: number;
  high_count: number;
  most_common_drift?: DriftType | null;
  last_violation?: string | null;
}

/** Drift summary statistics. */
export interface DriftSummary {
  total_findings: number;
  unresolved_findings: number;
  by_severity: DriftCountBySeverity;
  by_type: DriftCountByType;
  compliance_gap_percentage: number;
  worst_offenders: WorstOffender[];
  policies_with_drift: string[];
}

/** Response from drift analysis. */
export interface DriftAnalysisResponse {
  findings: PolicyDriftFinding[];
  summary: DriftSummary;
  analysis_window_hours: number;
  total_events_analyzed: number;
  /**
   * When the backend actually ran the analysis (ISO 8601). The result is cached, so this can be
   * meaningfully older than the client's fetch time — display THIS, not `new Date()`.
   */
  last_analysis?: string | null;
  live: boolean;
  source: string;
  note?: string | null;
}

/** Response for drift findings list. */
export interface DriftFindingsListResponse {
  findings: PolicyDriftFinding[];
  total: number;
  unresolved: number;
  live: boolean;
  source: string;
  note?: string | null;
}

/** Response for drift summary. */
export interface DriftSummaryResponse {
  summary: DriftSummary;
  analysis_window_hours: number;
  live: boolean;
  source: string;
  note?: string | null;
}

/** Response for worst offenders. */
export interface WorstOffendersResponse {
  offenders: WorstOffender[];
  analysis_window_hours: number;
  live: boolean;
  source: string;
  note?: string | null;
}

/** Policy Drift API. */
export const governPolicyDriftApi = {
  /** Analyze policy-reality drift. */
  analyze: async (hours = 24): Promise<DriftAnalysisResponse> =>
    (await client.get('/api/v1/govern/policy-drift/analyze', { params: { hours } })).data,

  /** Get drift summary statistics. */
  summary: async (hours = 24): Promise<DriftSummaryResponse> =>
    (await client.get('/api/v1/govern/policy-drift/summary', { params: { hours } })).data,

  /** List drift findings with filters. */
  findings: async (params?: {
    drift_type?: DriftType;
    severity?: DriftSeverity;
    resolved?: boolean;
    limit?: number;
  }): Promise<DriftFindingsListResponse> =>
    (await client.get('/api/v1/govern/policy-drift/findings', { params })).data,

  /** Resolve a drift finding. */
  resolve: async (findingId: string, resolutionNote?: string): Promise<PolicyDriftFinding> =>
    (await client.post(`/api/v1/govern/policy-drift/findings/${findingId}/resolve`, {
      resolution_note: resolutionNote,
    })).data,

  /** Get worst offenders. */
  offenders: async (hours = 24, limit = 10): Promise<WorstOffendersResponse> =>
    (await client.get('/api/v1/govern/policy-drift/offenders', { params: { hours, limit } })).data,
};

// ---------------------------------------------------------------------------
// Govern Posture Score — Single metric for AI fleet governance health
// ---------------------------------------------------------------------------

/** Posture dimension types. */
export type PostureDimension =
  | 'policy_coverage'
  | 'killswitch_ready'
  | 'audit_completeness'
  | 'incident_response'
  | 'validation_coverage'
  | 'detection_breadth';

/** Letter grades for posture score. */
export type PostureGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/** Trend direction for posture score. */
export type PostureTrend = 'improving' | 'stable' | 'degrading';

/** A specific finding that contributed to a dimension score. */
export interface DimensionFinding {
  item: string;
  status: string;
  detail?: string | null;
  /**
   * Points of the parent dimension's 0-100 score attributable to this item — same unit and
   * scale as DimensionScore.score, so a dimension's findings sum toward its score.
   *
   * NOT a -10..10 severity rating. The backend bound was -10..10 with the unit left unstated,
   * which rejected the two producers that did the arithmetic properly (killswitch_ready's
   * 40/20/20/20 check points, detection_breadth's 33.3 per active source) and took their whole
   * dimension down with them. If you render this, label it as points of the dimension score.
   */
  impact: number;
}

/**
 * Why a dimension has score === null. Distinguishes a measured empty result from a
 * calculation that failed — a bare null cannot, and the two demand opposite responses.
 */
export type UnscoredReason =
  /** Reached the store or API; it held no items. A measured zero, and therefore live data. */
  | 'nothing_assessed'
  /** The calculation raised. Nothing was verified, so assert nothing about this dimension. */
  | 'calculation_failed';

/** A recommended action to improve a dimension score. */
export interface DimensionRecommendation {
  action: string;
  impact: string;
  effort: string;
  priority: number;
}

/** Score and details for a single governance dimension. */
export interface DimensionScore {
  dimension: PostureDimension;
  label: string;
  description: string;
  /**
   * null when this dimension assessed nothing — render "not scored", never 0.
   *
   * Three dimensions used to return an arbitrary midpoint for an empty result set
   * (audit_completeness 50, validation_coverage 50, killswitch_ready 40 on its exception
   * path) and one returned 100 for "no incidents detected". Together they carried half the
   * weight, so half of a graded A-F posture score was invented. Measured on the reference
   * account, correcting it moved the score 56.8 (F) to 66.7 (D) at 50% measured weight.
   */
  score: number | null;
  /** Always set when score is null, always null when score is set. */
  unscored_reason?: UnscoredReason | null;
  weight: number;
  weighted_contribution: number | null;
  findings: DimensionFinding[];
  recommendations: DimensionRecommendation[];
  items_assessed: number;
  items_compliant: number;
  live: boolean;
  source: string;
  note?: string | null;
}

/** Overall governance posture score. */
export interface PostureScoreResponse {
  /** Weighted mean over MEASURED dimensions only, renormalised — see measured_weight_pct. */
  overall_score: number;
  grade: PostureGrade;
  grade_label: string;
  /**
   * Share of total dimension weight that produced a score at all, from live or seeded data
   * alike. The score and grade rest on this much of the model, so render it alongside them —
   * a D at 50% coverage is a different statement from a D at 100%.
   *
   * This is a COMPLETENESS figure, not a provenance one. For provenance read live_weight_pct.
   */
  measured_weight_pct: number;
  /**
   * Share of TOTAL weight that both produced a score and read live AWS data. Always
   * <= measured_weight_pct; the gap is score computed from seeded or fallback inputs, which
   * measured_weight_pct alone hid.
   */
  live_weight_pct?: number;
  /** Every dimension excluded from the overall score, for any reason. */
  unmeasured_dimensions: string[];
  /**
   * Subset of unmeasured_dimensions whose calculation raised. Split out because the two
   * demand opposite responses: nothing-assessed is a governance gap to close,
   * failed-to-compute is a broken integration to fix. Surface these as an error state, not
   * as missing coverage.
   */
  failed_dimensions?: string[];
  dimensions: DimensionScore[];
  trend: PostureTrend;
  trend_delta: number;
  calculated_at: string;
  cached_at?: string | null;
  live: boolean;
  partial_live: boolean;
  source: string;
  note?: string | null;
}

/** A prioritized action to improve the overall posture score. */
export interface PostureRecommendation {
  action: string;
  dimension: PostureDimension;
  current_score: number;
  projected_score: number;
  overall_impact: number;
  effort: string;
  priority: number;
  reasoning: string;
}

/** Response for recommendations endpoint. */
export interface PostureRecommendationsResponse {
  recommendations: PostureRecommendation[];
  current_score: number;
  current_grade: PostureGrade;
  projected_score: number;
  projected_grade: PostureGrade;
  live: boolean;
  source: string;
}

/** A single point in posture score history. */
export interface PostureHistoryEntry {
  timestamp: string;
  overall_score: number;
  grade: PostureGrade;
  dimensions: Record<PostureDimension, number>;
  note?: string | null;
}

/** Response for history endpoint. */
export interface PostureHistoryResponse {
  entries: PostureHistoryEntry[];
  period_days: number;
  current_score: number;
  period_start_score: number;
  trend: PostureTrend;
  trend_delta: number;
  live: boolean;
  source: string;
}

/** Posture Score API. */
export const governPostureScoreApi = {
  /** Get current governance posture score. */
  score: async (): Promise<PostureScoreResponse> =>
    (await client.get('/api/v1/govern/posture-score/score')).data,

  /** Get detailed breakdown of all dimensions. */
  dimensions: async (): Promise<DimensionScore[]> =>
    (await client.get('/api/v1/govern/posture-score/dimensions')).data,

  /** Get detailed info for a specific dimension. */
  dimension: async (dimension: PostureDimension): Promise<DimensionScore> =>
    (await client.get(`/api/v1/govern/posture-score/dimensions/${dimension}`)).data,

  /** Get prioritized recommendations to improve score. */
  recommendations: async (): Promise<PostureRecommendationsResponse> =>
    (await client.get('/api/v1/govern/posture-score/recommendations')).data,

  /** Get posture score history for trend analysis. */
  history: async (days = 30): Promise<PostureHistoryResponse> =>
    (await client.get('/api/v1/govern/posture-score/history', { params: { days } })).data,
};

// ═══════════════════════════════════════════════════════════════════════════════
// Compliance Evidence Chain Types & API
// ═══════════════════════════════════════════════════════════════════════════════

/** Supported compliance frameworks. */
export type ComplianceFramework =
  | 'soc2'
  | 'nist-ai-rmf'
  | 'iso-42001'
  | 'ffiec'
  | 'pci-dss'
  | 'gdpr-ai';

/** Evidence collection status for compliance. */
/**
 * 'illustrative' means evidence exists for the control but is a worked example, not a
 * reading from the named source. It is distinct from 'collected' because "collected" is the
 * claim an auditor relies on — 11 of the 12 backend collectors return hardcoded literals,
 * and reporting those as 'collected' made the Compliance Evidence Chain assert full SOC 2
 * coverage (7/7, 100%) when only the kill-switch reader measured anything (1/7, 14.3%).
 */
export type ComplianceEvidenceStatus = 'collected' | 'pending' | 'gap' | 'expired' | 'illustrative';

/** Types of compliance evidence that can be collected. */
export type ComplianceEvidenceType =
  | 'killswitch_status'
  | 'audit_artifact'
  | 'validation_panel'
  | 'policy_config'
  | 'incident_metrics'
  | 'tool_tier_config'
  | 'path_jail_config'
  | 'cloudtrail_events'
  | 'approval_workflow'
  | 'access_log'
  | 'drift_detection'
  | 'posture_score';

/** AVA internal controls. */
export type AvaControl =
  | 'killswitch'
  | 'audit_artifacts'
  | 'validation_panels'
  | 'tool_tiers'
  | 'path_jailing'
  | 'harness_policies'
  | 'candidate_incidents'
  | 'cloudtrail_integration'
  | 'rbac'
  | 'approval_workflows'
  | 'adversarial_review'
  | 'drift_detection'
  | 'posture_scoring'
  | 'harness_detection';

/** Framework info returned by list endpoint. */
export interface ComplianceFrameworkInfo {
  id: ComplianceFramework;
  name: string;
  control_count: number;
  description: string;
}

/** List frameworks response. */
export interface FrameworkListResponse {
  frameworks: ComplianceFrameworkInfo[];
  total: number;
}

/** Coverage metrics for a framework. */
export interface FrameworkCoverageResponse {
  framework: ComplianceFramework;
  framework_name: string;
  total_controls: number;
  covered_controls: number;
  pending_controls: number;
  gap_controls: number;
  coverage_percentage: number;
  last_updated?: string | null;
}

/** Mapping from framework control to AVA controls. */
export interface ControlMapping {
  framework: ComplianceFramework;
  control_id: string;
  control_name: string;
  description: string;
  ava_controls: AvaControl[];
  evidence_types: ComplianceEvidenceType[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  notes?: string | null;
}

/** Control mappings response. */
export interface ControlMappingsResponse {
  framework: ComplianceFramework;
  framework_name: string;
  mappings: ControlMapping[];
  total: number;
}

/** A piece of collected compliance evidence. */
export interface ComplianceEvidenceItem {
  evidence_id: string;
  control_mapping_id: string;
  evidence_type: ComplianceEvidenceType;
  source: string;
  data: Record<string, unknown>;
  collected_at: string;
  validity_period_days: number;
  status: ComplianceEvidenceStatus;
  collected_by: string;
  /** 'measured' = read from `source`; 'illustrative' = a worked example. */
  provenance?: 'measured' | 'illustrative';
}

/** Compliance evidence collection response. */
export interface ComplianceEvidenceResponse {
  control_mapping_id: string;
  evidence_items: ComplianceEvidenceItem[];
  status: ComplianceEvidenceStatus;
  total: number;
}

/** Coverage status for a single compliance control. */
export interface ComplianceControlCoverage {
  control_id: string;
  control_name: string;
  description: string;
  ava_controls: string[];
  evidence_status: ComplianceEvidenceStatus;
  evidence_count: number;
  last_evidence_at?: string | null;
  gap_reason?: string | null;
}

/** Full compliance report. */
export interface ComplianceReport {
  report_id: string;
  framework: ComplianceFramework;
  framework_name: string;
  coverage_percentage: number;
  total_controls: number;
  covered_controls: number;
  pending_controls: number;
  gap_controls: number;
  control_coverages: ComplianceControlCoverage[];
  evidence_items: ComplianceEvidenceItem[];
  gaps: string[];
  generated_at: string;
  generated_by: string;
  validity_days: number;
}

/** Auditor-ready evidence export. */
export interface EvidenceExport {
  export_id: string;
  framework: ComplianceFramework;
  framework_name: string;
  export_format: string;
  generated_at: string;
  generated_by: string;
  organization: string;
  reporting_period_start: string;
  reporting_period_end: string;
  report: ComplianceReport;
  evidence_summary: Record<string, number>;
  attestation_statement: string;
}

/** Bulk collect response. */
export interface BulkCollectResponse {
  framework: string;
  controls_processed: number;
  errors: { control_id: string; error: string }[];
  success: boolean;
}

/** Compliance Evidence Chain API. */
export const governComplianceEvidenceApi = {
  /** List all supported compliance frameworks. */
  listFrameworks: async (): Promise<FrameworkListResponse> =>
    (await client.get('/api/v1/govern/compliance-evidence/frameworks')).data,

  /** Get coverage metrics for a framework. */
  getCoverage: async (framework: ComplianceFramework): Promise<FrameworkCoverageResponse> =>
    (await client.get(`/api/v1/govern/compliance-evidence/frameworks/${framework}/coverage`)).data,

  /** Get all control mappings for a framework. */
  getControlMappings: async (framework: ComplianceFramework): Promise<ControlMappingsResponse> =>
    (await client.get(`/api/v1/govern/compliance-evidence/frameworks/${framework}/controls`)).data,

  /** Get or collect evidence for a specific control. */
  getEvidence: async (framework: ComplianceFramework, controlId: string): Promise<ComplianceEvidenceResponse> =>
    (await client.get(`/api/v1/govern/compliance-evidence/frameworks/${framework}/evidence/${controlId}`)).data,

  /** Force refresh evidence for a control. */
  refreshEvidence: async (framework: ComplianceFramework, controlId: string): Promise<ComplianceEvidenceResponse> =>
    (await client.post(`/api/v1/govern/compliance-evidence/frameworks/${framework}/evidence/${controlId}/refresh`)).data,

  /** Generate a full compliance report. */
  generateReport: async (framework: ComplianceFramework): Promise<ComplianceReport> =>
    (await client.get(`/api/v1/govern/compliance-evidence/frameworks/${framework}/report`)).data,

  /** Export auditor-ready evidence package. */
  exportEvidence: async (framework: ComplianceFramework, format: 'json' | 'csv' = 'json'): Promise<EvidenceExport> =>
    (await client.get(`/api/v1/govern/compliance-evidence/frameworks/${framework}/export`, { params: { format } })).data,

  /** Collect evidence for all controls in a framework. */
  collectAll: async (framework: ComplianceFramework): Promise<BulkCollectResponse> =>
    (await client.post(`/api/v1/govern/compliance-evidence/frameworks/${framework}/collect-all`)).data,
};

// ─────────────────────────── Govern LLM Quality API ───────────────────────────
// LLM output quality monitoring via CloudWatch custom metrics and Bedrock Guardrails

export type LlmQualityDimension =
  | 'groundedness' | 'relevance' | 'coherence' | 'harmful_rate'
  | 'refusal_rate' | 'latency_p99' | 'tokens_per_response' | 'citation_accuracy';

export interface LlmQualityMetric {
  dimension: LlmQualityDimension;
  value: number;
  unit: string;
  model_id?: string;
  use_case?: string;
  timestamp: string;
}

export interface LlmQualitySnapshot {
  metrics: LlmQualityMetric[];
  period_minutes: number;
  live: boolean;
  source: string;
  note?: string;
}

export interface LlmQualityTrend {
  dimension: LlmQualityDimension;
  datapoints: { timestamp: string; value: number }[];
  period_hours: number;
  live: boolean;
}

export interface LlmMonitoringStatus {
  guardrail_monitoring_active: boolean;
  custom_metrics_active: boolean;
  /**
   * llm- prefixed alarms found. DescribeAlarms is capped at 100 records, so this can be a
   * page rather than the set; when it is, `note` says so. Do not present its length as a
   * total without rendering `note`.
   */
  active_alarms: string[];
  alarms_in_alarm: string[];
  dashboard_deployed: boolean;
  namespace: string;
  live: boolean;
  source: string;
  /**
   * Honest-degrade caveat. Set whenever any field above could not be measured (alarm list
   * truncated, DescribeAlarms or GetDashboard failed, malformed request, AWS unreachable)
   * and also carries the cache stamp on a cached live read. Must be rendered: a truncated
   * alarm count with no caveat reads as a total.
   */
  note?: string | null;
}

export const governLlmQualityApi = {
  status: async (): Promise<LlmMonitoringStatus> =>
    (await client.get('/api/v1/govern/llm-quality/status')).data,

  metrics: async (periodMinutes = 5): Promise<LlmQualitySnapshot> =>
    (await client.get('/api/v1/govern/llm-quality/metrics', { params: { period_minutes: periodMinutes } })).data,

  trend: async (dimension: LlmQualityDimension, hours = 24): Promise<LlmQualityTrend> =>
    (await client.get(`/api/v1/govern/llm-quality/metrics/${dimension}/trend`, { params: { hours } })).data,

  deployDashboard: async (): Promise<{ dashboard_name: string }> =>
    (await client.post('/api/v1/govern/llm-quality/dashboard')).data,

  createAlarms: async (): Promise<{ alarm_names: string[] }> =>
    (await client.post('/api/v1/govern/llm-quality/alarms')).data,
};

// ---------------------------------------------------------------------------
// Govern Path Jail — Rule management for harness path security
// ---------------------------------------------------------------------------

/** Pattern matching type for path rules. */
export type PathJailPatternType = 'glob' | 'regex' | 'exact';

/** Scope of a path jail rule. */
export type PathJailRuleScope = 'global' | 'harness';

/** Types of path jail violations. */
export type PathJailViolationType = 'traversal_attack' | 'symlink_escape' | 'absolute_outside' | 'blocked_pattern' | 'not_allowed';

/** A path jailing rule. */
export interface PathJailRule {
  id: string;
  pattern: string;
  pattern_type: PathJailPatternType;
  description: string;
  scope: PathJailRuleScope;
  harness_types: string[];
  enabled: boolean;
  is_default: boolean;
  created_at: string;
  updated_at?: string | null;
}

/** Request to create a new path jail rule. */
export interface PathJailRuleCreate {
  pattern: string;
  pattern_type?: PathJailPatternType;
  description?: string;
  scope?: PathJailRuleScope;
  harness_types?: string[];
  enabled?: boolean;
}

/** Request to update a path jail rule. */
export interface PathJailRuleUpdate {
  pattern?: string;
  pattern_type?: PathJailPatternType;
  description?: string;
  scope?: PathJailRuleScope;
  harness_types?: string[];
  enabled?: boolean;
}

/** Response containing all path jail rules. */
export interface PathJailRulesResponse {
  rules: PathJailRule[];
  total: number;
  default_count: number;
  custom_count: number;
}

/** Request to test a path against rules. */
export interface PathTestRequest {
  path: string;
  harness_type?: string;
}

/** Result of testing a path against rules. */
export interface PathTestResult {
  path: string;
  would_be_blocked: boolean;
  matching_rules: PathJailRule[];
  reason: string;
}

/** Request to test one pattern against one path (previewing an unsaved rule). */
export interface PatternTestRequest {
  path: string;
  pattern: string;
  pattern_type?: PathJailPatternType;
}

/** Result of testing one pattern against one path.
 *
 * `matched` rather than `would_be_blocked`: this asks only whether the pattern matches.
 * Traversal and absolute paths are refused before any rule is consulted, so a path can match
 * no pattern and still be blocked - use `testPath` for the full verdict.
 */
export interface PatternTestResult {
  path: string;
  pattern: string;
  pattern_type: PathJailPatternType;
  matched: boolean;
  reason: string;
}

/** A recorded path jail violation. */
export interface PathJailViolation {
  id: string;
  timestamp: string;
  path: string;
  harness_type: string;
  user_identity: string;
  violation_type: PathJailViolationType;
  matched_rule_id?: string | null;
  matched_pattern?: string | null;
  details: string;
}

/** Response containing recent violations. */
export interface PathJailViolationsResponse {
  violations: PathJailViolation[];
  total: number;
}

/** Path Jail API. */
export const governPathJailApi = {
  /** List all path jail rules. */
  listRules: async (includeDisabled = false): Promise<PathJailRulesResponse> =>
    (await client.get('/api/v1/govern/path-jail/rules', { params: { include_disabled: includeDisabled } })).data,

  /** Get a specific rule by ID. */
  getRule: async (ruleId: string): Promise<PathJailRule> =>
    (await client.get(`/api/v1/govern/path-jail/rules/${ruleId}`)).data,

  /** Create a new custom path jail rule. */
  createRule: async (request: PathJailRuleCreate): Promise<PathJailRule> =>
    (await client.post('/api/v1/govern/path-jail/rules', request)).data,

  /** Update a path jail rule. */
  updateRule: async (ruleId: string, update: PathJailRuleUpdate): Promise<PathJailRule> =>
    (await client.put(`/api/v1/govern/path-jail/rules/${ruleId}`, update)).data,

  /** Delete a custom path jail rule. */
  deleteRule: async (ruleId: string): Promise<{ status: string; rule_id: string }> =>
    (await client.delete(`/api/v1/govern/path-jail/rules/${ruleId}`)).data,

  /** Test a path against all active rules. */
  testPath: async (request: PathTestRequest): Promise<PathTestResult> =>
    (await client.post('/api/v1/govern/path-jail/test', request)).data,

  /** Test one pattern against one path, for previewing a rule that is not saved yet. */
  testPattern: async (request: PatternTestRequest): Promise<PatternTestResult> =>
    (await client.post('/api/v1/govern/path-jail/test-pattern', request)).data,

  /** Get recent path jail violations. */
  getViolations: async (limit = 10, harnessType?: string): Promise<PathJailViolationsResponse> =>
    (await client.get('/api/v1/govern/path-jail/violations', { params: { limit, harness_type: harnessType } })).data,

  /** Get default blocked patterns. */
  getDefaultPatterns: async (): Promise<{ patterns: Array<{ pattern: string; description: string }>; total: number }> =>
    (await client.get('/api/v1/govern/path-jail/default-patterns')).data,

  /** Get rules for a specific harness type. */
  getHarnessOverrides: async (harnessType: string): Promise<PathJailRulesResponse> =>
    (await client.get(`/api/v1/govern/path-jail/harness-overrides/${harnessType}`)).data,
};

// ---------------------------------------------------------------------------
// Govern Capacity — AWS Service Quotas for capacity management
// ---------------------------------------------------------------------------

/** Status of a quota based on usage percentage. */
export type QuotaStatus = 'ok' | 'attention' | 'warning' | 'critical';

/** Individual service quota with current usage. */
export interface ServiceQuota {
  service_code: string;
  service_name: string;
  quota_code: string;
  quota_name: string;
  value: number;
  unit: string;
  usage: number;
  usage_pct: number;
  adjustable: boolean;
  global_quota: boolean;
  status: QuotaStatus;
}

/** Response containing all AI-relevant service quotas. */
export interface QuotasResponse {
  quotas: ServiceQuota[];
  total_monitored: number;
  at_risk_count: number;
  critical_count: number;
  live: boolean;
  source: string;
  note?: string | null;
}

/** Alert for a quota approaching its limit. */
export interface CapacityAlert {
  service_code: string;
  service_name: string;
  quota_code: string;
  quota_name: string;
  value: number;
  usage: number;
  usage_pct: number;
  severity: 'warning' | 'critical';
  recommendation: string;
}

/** Response containing quota alerts. */
export interface AlertsResponse {
  alerts: CapacityAlert[];
  warning_count: number;
  critical_count: number;
  live: boolean;
  source: string;
  note?: string | null;
}

/** Single data point for usage history. */
export interface UsageDataPoint {
  timestamp: string;
  value: number;
  limit: number;
}

/** Usage trend history for a service. */
export interface UsageHistoryResponse {
  service_code: string;
  service_name: string;
  data_points: UsageDataPoint[];
  period_start: string;
  period_end: string;
  current_usage: number;
  current_limit: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  live: boolean;
  source: string;
  note?: string | null;
}

/** Request to increase a service quota.
 *
 *  `reason` is NOT transmitted to AWS. RequestServiceQuotaIncrease accepts only
 *  ServiceCode/QuotaCode/DesiredValue - there is no justification field. The backend
 *  logs the reason control-plane-side so the decision stays recoverable, but nobody at
 *  AWS reads it. UI that collects a justification must say so. */
export interface QuotaIncreaseRequest {
  service_code: string;
  quota_code: string;
  desired_value: number;
  reason: string;
}

/** Outcome of a quota increase request.
 *
 *  - `submitted` - AWS accepted the request. The limit has NOT changed yet; AWS still
 *    has to approve it.
 *  - `pending`   - an increase for this quota was already open. `case_id`/`request_id`
 *    identify the EXISTING request, not a new one.
 *  - `approved`  - AWS has already granted it.
 *  - `denied`    - AWS judged the request and refused it. This is an answer.
 *  - `invalid`   - the control plane rejected the request before submitting it, so AWS
 *    never saw it: the quota is not adjustable through Service Quotas, or the desired
 *    value is not above the current limit. Neither an AWS denial nor a failed call - the
 *    caller's input is what to change. `live` is still `true`, because the figures quoted
 *    in `message` come from a successful GetServiceQuota call.
 *  - `error`     - nothing was submitted: permissions, throttling, a server fault, or an
 *    unreachable endpoint. Deliberately not reported as `denied`, because denied implies
 *    AWS judged the request. This is a non-answer and must render differently.
 *
 *  Three outcomes therefore mean "no increase was filed" for three different reasons, and
 *  must not be collapsed: `denied` (AWS said no), `invalid` (we said no), `error` (nobody
 *  said anything). */
export type QuotaIncreaseStatus =
  | 'submitted'
  | 'pending'
  | 'denied'
  | 'approved'
  | 'invalid'
  | 'error';

/** Response from a quota increase request. */
export interface QuotaIncreaseResponse {
  case_id?: string | null;
  request_id?: string | null;
  /** Normally a QuotaIncreaseStatus, but typed to admit an unrecognised value.
   *
   *  The backend's status set has moved once already (`invalid` was split out of `denied`),
   *  so consumers must have a default branch that degrades gracefully - treating an unknown
   *  status as unresolved - instead of an exhaustive switch that renders blank on a value it
   *  has not been taught. */
  status: QuotaIncreaseStatus | (string & {});
  message: string;
  live: boolean;
  source: string;
  /** Degrade explanation, ADDITIVE to `message`. `null` for every status AWS produced
   *  (submitted/approved/denied/pending), whose `message` is already complete; populated for
   *  `invalid` and for the `error` paths. Do not render an affordance that looks broken when
   *  absent. */
  note?: string | null;
}

/** Govern Capacity API — Service Quotas for AI capacity management. */
export const governCapacityApi = {
  /** List AI-relevant service quotas with current usage. */
  quotas: async (): Promise<QuotasResponse> =>
    (await client.get('/api/v1/govern/capacity/quotas')).data,

  /** Get quotas approaching their limits (>70% used). */
  alerts: async (): Promise<AlertsResponse> =>
    (await client.get('/api/v1/govern/capacity/alerts')).data,

  /** Get usage trend history for a service. */
  history: async (service: string, days = 7): Promise<UsageHistoryResponse> =>
    (await client.get(`/api/v1/govern/capacity/history/${service}`, { params: { days } })).data,

  /** Submit a quota increase request. POST /capacity/request-increase (ADMIN role).
   *
   *  This is a genuine write against AWS Service Quotas in the governed region, and for
   *  most quotas it opens a real AWS Support case. Callers must confirm intent before
   *  calling it. Inspect `status` rather than assuming success: `error` means nothing was
   *  submitted, and `submitted` does not mean the limit changed. */
  requestIncrease: async (request: QuotaIncreaseRequest): Promise<QuotaIncreaseResponse> =>
    (await client.post('/api/v1/govern/capacity/request-increase', request)).data,
};

// ─────────────────────────── Govern IAM API ───────────────────────────
// Vendor IAM access analysis for third-party risk management.

/** IAM role associated with a vendor integration. */
export interface VendorIAMRole {
  name: string;
  arn: string;
  last_used: string | null;
  trust_policy_summary: string;
  created_date: string | null;
}

/** IAM policy attached to vendor roles. */
export interface VendorIAMPolicy {
  name: string;
  policy_type: 'managed' | 'inline';
  arn: string | null;
  permissions: string[];
  resource_scope: string;
}

/** Complete IAM access summary for a vendor. */
export interface VendorIAMAccess {
  vendor_id: string;
  vendor_name: string;
  has_aws_access: boolean;
  roles: VendorIAMRole[];
  policies: VendorIAMPolicy[];
  risk_level: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
  last_activity: string | null;
  total_permissions: number;
  sensitive_permissions: string[];
  recommendations: string[];
  live: boolean;
  source: string;
  note: string | null;
}

/** Govern IAM API — Vendor IAM access for third-party risk. */
export const governIamApi = {
  /** Get IAM access summary for a specific vendor. */
  vendorAccess: async (vendorId: string): Promise<VendorIAMAccess> =>
    (await client.get(`/api/v1/govern/iam/vendor-access/${encodeURIComponent(vendorId)}`)).data,
};

// ─── Multi-Cloud Connectors API ─────────────────────────────────────────────────

export interface MultiCloudCostItem {
  service: string;
  amount: number;
  currency: string;
}

export interface MultiCloudCostSummary {
  provider: string;
  total: number;
  currency: string;
  period_start: string;
  period_end: string;
  by_service: MultiCloudCostItem[];
  live: boolean;
  source: string;
  note: string | null;
}

export interface MultiCloudAgent {
  agent_id: string;
  name: string;
  provider: string;
  status: string;
  model: string | null;
  created_at: string | null;
  last_invoked: string | null;
  invocation_count: number;
  region: string | null;
}

export interface MultiCloudAgentInventory {
  provider: string;
  agents: MultiCloudAgent[];
  total: number;
  live: boolean;
  source: string;
  note: string | null;
}

/**
 * The measured outcome of a connector's last token exchange. Never inferred.
 *
 * Mirrors `_SecretsBackedConnector.auth_state()` in
 * backend/src/services/multicloud_connector_service.py:
 * - `unknown`     no exchange has been attempted with the credentials in hand
 * - `ok`          the provider issued a token
 * - `rejected`    the provider refused the credentials (non-retryable status)
 * - `unavailable` the provider could not be reached, or answered 429/5xx
 * - `incomplete`  required credential fields are absent, so nothing was sent
 */
export type MultiCloudAuthState = 'unknown' | 'ok' | 'rejected' | 'unavailable' | 'incomplete';

export interface MultiCloudConnectorStatus {
  provider: string;
  label: string;
  /** The provider actually issued a token. */
  connected: boolean;
  /**
   * The secret was read and the required fields are non-empty. Presence only, measurable
   * without touching the provider. A connector can be `configured` with credentials the
   * provider has already rejected, so this must NOT be rendered as a neutral
   * "Configured" state without consulting `auth_state`.
   */
  configured: boolean;
  source: string;
  detail: string;
  last_sync: string | null;
  /**
   * Measured outcome of the last token exchange. Optional because older backend builds
   * omit it; treat a missing value as 'unknown'.
   */
  auth_state?: MultiCloudAuthState;
  /** Short, credential-free description of the last auth failure, if any. */
  auth_detail?: string | null;
}

export interface MultiCloudConnectorsResponse {
  connectors: MultiCloudConnectorStatus[];
  live: boolean;
  source: string;
}

export interface MultiCloudAllCosts {
  // Cloud Service Providers
  azure: MultiCloudCostSummary;
  gcp: MultiCloudCostSummary;
  // SaaS Platforms
  servicenow: MultiCloudCostSummary;
  salesforce: MultiCloudCostSummary;
  copilot_studio: MultiCloudCostSummary;
}

export interface MultiCloudAllAgents {
  // Cloud Service Providers
  azure: MultiCloudAgentInventory;
  gcp: MultiCloudAgentInventory;
  // SaaS Platforms
  servicenow: MultiCloudAgentInventory;
  salesforce: MultiCloudAgentInventory;
  copilot_studio: MultiCloudAgentInventory;
}

export interface ConfigureAzureRequest {
  tenant_id: string;
  client_id: string;
  client_secret: string;
  subscription_id: string;
}

export interface ConfigureGCPRequest {
  project_id: string;
  service_account_json: string;
  billing_export_table?: string;
  location?: string;
}

export interface ConfigureServiceNowRequest {
  instance_url: string;
  client_id: string;
  client_secret: string;
  monthly_license_cost?: number;
}

export interface ConfigureSalesforceRequest {
  client_id: string;
  client_secret: string;
  login_url?: string;
  monthly_license_cost?: number;
}

export interface ConfigureCopilotStudioRequest {
  tenant_id: string;
  client_id: string;
  client_secret: string;
  environment_id: string;
  monthly_capacity_cost?: number;
}

export interface ConfigureResponse {
  success: boolean;
  message: string;
  /**
   * Whether the connector URL was reachable when we stored it.
   *
   * Three states, and the third is not the second: `true` = checked and it resolved,
   * `false` = stored but the check could not be completed, `null`/absent = this provider
   * has no caller-supplied URL, so there was nothing to check. Optional because only two
   * of the five providers can return anything but null.
   *
   * `success` is a statement about the write, not about the URL - the backend raises a 500
   * when the write fails, so `success` is always true on a 200. Treating it as "everything
   * is fine" is what made an unverified write read as a verified one for a whole release.
   */
  url_verified?: boolean | null;
}

export interface TestConnectionResult {
  provider: string;
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
  latency_ms?: number;
  tested_at: string;
}

/** Multi-Cloud Connectors API — Cloud (Azure, GCP) and SaaS (ServiceNow, Salesforce, Copilot Studio) cost/agent data. */
export const multicloudApi = {
  /** Get status of all cloud and SaaS connectors. */
  status: async (): Promise<MultiCloudConnectorsResponse> =>
    (await client.get("/api/v1/govern/multicloud/status")).data,

  /** Get cost summaries from all providers. */
  allCosts: async (days = 30): Promise<MultiCloudAllCosts> =>
    (await client.get("/api/v1/govern/multicloud/costs", { params: { days } })).data,

  // ─── Cloud Service Provider Costs ─────────────────────────────────────────────
  /** Get Azure cost summary. */
  azureCosts: async (days = 30): Promise<MultiCloudCostSummary> =>
    (await client.get("/api/v1/govern/multicloud/costs/azure", { params: { days } })).data,

  /** Get GCP cost summary. */
  gcpCosts: async (days = 30): Promise<MultiCloudCostSummary> =>
    (await client.get("/api/v1/govern/multicloud/costs/gcp", { params: { days } })).data,

  // ─── SaaS Platform Costs ──────────────────────────────────────────────────────
  /** Get ServiceNow cost summary (license-based). */
  servicenowCosts: async (days = 30): Promise<MultiCloudCostSummary> =>
    (await client.get("/api/v1/govern/multicloud/costs/servicenow", { params: { days } })).data,

  /** Get Salesforce cost summary (license-based). */
  salesforceCosts: async (days = 30): Promise<MultiCloudCostSummary> =>
    (await client.get("/api/v1/govern/multicloud/costs/salesforce", { params: { days } })).data,

  /** Get Copilot Studio cost summary (capacity-based). */
  copilotStudioCosts: async (days = 30): Promise<MultiCloudCostSummary> =>
    (await client.get("/api/v1/govern/multicloud/costs/copilot-studio", { params: { days } })).data,

  /** Get agent inventories from all providers. */
  allAgents: async (): Promise<MultiCloudAllAgents> =>
    (await client.get("/api/v1/govern/multicloud/agents")).data,

  // ─── Cloud Service Provider Agents ────────────────────────────────────────────
  /** Get Azure AI Foundry agents. */
  azureAgents: async (): Promise<MultiCloudAgentInventory> =>
    (await client.get("/api/v1/govern/multicloud/agents/azure")).data,

  /** Get GCP Vertex AI agents. */
  gcpAgents: async (): Promise<MultiCloudAgentInventory> =>
    (await client.get("/api/v1/govern/multicloud/agents/gcp")).data,

  // ─── SaaS Platform Agents ─────────────────────────────────────────────────────
  /** Get ServiceNow AI agents. */
  servicenowAgents: async (): Promise<MultiCloudAgentInventory> =>
    (await client.get("/api/v1/govern/multicloud/agents/servicenow")).data,

  /** Get Salesforce Agentforce agents. */
  salesforceAgents: async (): Promise<MultiCloudAgentInventory> =>
    (await client.get("/api/v1/govern/multicloud/agents/salesforce")).data,

  /** Get Copilot Studio agents. */
  copilotStudioAgents: async (): Promise<MultiCloudAgentInventory> =>
    (await client.get("/api/v1/govern/multicloud/agents/copilot-studio")).data,

  // ─── Cloud Configuration ──────────────────────────────────────────────────────
  /** Configure Azure connector. */
  configureAzure: async (config: ConfigureAzureRequest): Promise<ConfigureResponse> =>
    (await client.post("/api/v1/govern/multicloud/configure/azure", config)).data,

  /** Configure GCP connector. */
  configureGcp: async (config: ConfigureGCPRequest): Promise<ConfigureResponse> =>
    (await client.post("/api/v1/govern/multicloud/configure/gcp", config)).data,

  /** Delete Azure connector configuration. */
  deleteAzure: async (): Promise<ConfigureResponse> =>
    (await client.delete("/api/v1/govern/multicloud/configure/azure")).data,

  /** Delete GCP connector configuration. */
  deleteGcp: async (): Promise<ConfigureResponse> =>
    (await client.delete("/api/v1/govern/multicloud/configure/gcp")).data,

  // ─── SaaS Configuration ───────────────────────────────────────────────────────
  /** Configure ServiceNow connector. */
  configureServicenow: async (config: ConfigureServiceNowRequest): Promise<ConfigureResponse> =>
    (await client.post("/api/v1/govern/multicloud/configure/servicenow", config)).data,

  /** Configure Salesforce connector. */
  configureSalesforce: async (config: ConfigureSalesforceRequest): Promise<ConfigureResponse> =>
    (await client.post("/api/v1/govern/multicloud/configure/salesforce", config)).data,

  /** Configure Copilot Studio connector. */
  configureCopilotStudio: async (config: ConfigureCopilotStudioRequest): Promise<ConfigureResponse> =>
    (await client.post("/api/v1/govern/multicloud/configure/copilot-studio", config)).data,

  /** Delete ServiceNow connector configuration. */
  deleteServicenow: async (): Promise<ConfigureResponse> =>
    (await client.delete("/api/v1/govern/multicloud/configure/servicenow")).data,

  /** Delete Salesforce connector configuration. */
  deleteSalesforce: async (): Promise<ConfigureResponse> =>
    (await client.delete("/api/v1/govern/multicloud/configure/salesforce")).data,

  /** Delete Copilot Studio connector configuration. */
  deleteCopilotStudio: async (): Promise<ConfigureResponse> =>
    (await client.delete("/api/v1/govern/multicloud/configure/copilot-studio")).data,

  // ─── Test Connection ───────────────────────────────────────────────────────────
  /** Test connection for a specific provider. */
  testConnection: async (provider: string): Promise<TestConnectionResult> =>
    (await client.post(`/api/v1/govern/multicloud/test-connection/${provider}`)).data,
};

// ─── Incident Management API ─────────────────────────────────────────────────

export type IncidentSeverity = 'Critical' | 'High' | 'Medium' | 'Low';
export type IncidentStatus = 'New' | 'Triaging' | 'Investigating' | 'Identified' | 'Monitoring' | 'Resolved';

export interface IncidentTimelineEntry {
  id: string;
  timestamp: string;
  type: 'status_change' | 'comment' | 'action' | 'alert' | 'communication';
  actor: string;
  description: string;
  metadata?: Record<string, string>;
}

export interface IncidentCommunicationLog {
  channel: 'slack' | 'pagerduty' | 'email';
  timestamp: string;
  message: string;
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  owner: string;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  affectedAgents: string[];
  relatedAlerts: string[];
  runbooksExecuted: string[];
  postmortemId?: string;
  linkedAlertId?: string;
  timeline: IncidentTimelineEntry[];
  communicationLog: IncidentCommunicationLog[];
  resolutionNotes?: string;
}

export interface IncidentFilters {
  status?: IncidentStatus | 'all';
  severity?: IncidentSeverity | 'all';
  owner?: string | 'all';
  dateRange?: 'today' | '7d' | '30d' | 'all';
  affectedAgent?: string;
}

export interface IncidentListResponse {
  incidents: Incident[];
  total: number;
  live: boolean;
  source: string;
  note?: string | null;
}

export interface IncidentDetailResponse {
  incident: Incident;
  live: boolean;
  source: string;
  note?: string | null;
}

export interface CreateIncidentRequest {
  title: string;
  description: string;
  severity: IncidentSeverity;
  owner: string;
  affectedAgents?: string[];
  linkedAlertId?: string;
}

export interface UpdateIncidentRequest {
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  owner?: string;
  resolutionNotes?: string;
}

export interface AddTimelineEventRequest {
  type: 'comment' | 'action';
  description: string;
  actor?: string;
  metadata?: Record<string, string>;
}

export interface IncidentMutationResponse {
  incident: Incident;
  success: boolean;
  message: string;
}

export interface OpsMetricsResponse {
  mttr_minutes: number;
  mttd_minutes: number;
  open_incidents: number;
  by_severity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  incidents_this_month: number;
  resolved_this_month: number;
  postmortems_pending: number;
  avg_resolution_minutes: number;
  // Extended fields for OpsOverview dashboard
  frameworkCompliance?: Array<{
    framework: string;
    status: 'compliant' | 'at-risk' | 'in-progress';
    controlsPassed: number;
    controlsTotal: number;
    nextAudit: string;
  }>;
  riskTrend7d?: Array<{ day: string; score: number }>;
  upcomingDeadlines?: Array<{
    title: string;
    dueDate: string;
    daysLeft: number;
    priority: 'high' | 'medium' | 'low';
  }>;
  policyViolations?: Array<{
    policy: string;
    agent: string;
    count: number;
    lastOccurrence: string;
  }>;
  trend24h?: Array<{
    hour: string;
    incidents: number;
    alerts: number;
    availability: number;
  }>;
  live: boolean;
  source: string;
  note?: string | null;
}

// ---------------------------------------------------------------------------
// governIncidentApi was REMOVED here. Do not reintroduce it.
//
// All twelve of its methods addressed `/api/v1/govern/incidents/*`. No such router is
// registered - the backend mounts incidents under the operations router, at
// `/api/v1/govern/operations/incidents`. So every call 404'd. Verified: nothing in the
// frontend imported it, which is the only reason the dead paths were never noticed.
//
// It was deleted rather than repointed because only half of its surface exists at all.
// Use `governOperationsApi` instead:
//
//   governIncidentApi.list             -> governOperationsApi.incidents
//   governIncidentApi.get              -> governOperationsApi.incidentDetail
//   governIncidentApi.create           -> governOperationsApi.createIncident
//   governIncidentApi.update           -> governOperationsApi.updateIncident
//   governIncidentApi.addTimelineEvent -> governOperationsApi.addIncidentTimelineEvent
//   governIncidentApi.metrics          -> governOperationsApi.opsMetrics
//                                         (GET /operations/metrics/summary)
//
// The remaining five - acknowledge, escalate, resolve, runRunbook, createPostmortem -
// have NO backend route, and never did. The first three are not capability gaps: the
// operations router's PATCH /incidents/{id} already accepts status, severity, owner and
// resolution notes, so acknowledge/escalate/resolve are that one call with a different
// payload. runRunbook and createPostmortem are genuinely unimplemented; a caller needing
// them must add the route, not a client method that pretends one exists.
//
// The camelCase Incident* request/response types above are still in use (useIncidents.ts,
// useOperationsApi.ts) and are deliberately kept.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Govern Operations API - Fleet health, alerts, SLAs, on-call, changes
// ---------------------------------------------------------------------------

export type FleetAgentStatus = 'healthy' | 'degraded' | 'down' | 'maintenance';
export type AlertSeverity = 'critical' | 'warning' | 'info';
export type ChangeStatus = 'Pending' | 'Approved' | 'Rejected' | 'Deployed' | 'Rolled Back';
export type ChangeType = 'model' | 'config' | 'policy' | 'infrastructure';

/** Agent health status as reported by the backend (matches AgentHealthStatus). */
export type AgentHealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';
/** Severity buckets for live CloudWatch alarms (matches backend AlertSeverity). */
export type AlarmSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
/** CloudWatch alarm state (matches backend AlertState). */
export type AlarmState = 'alarm' | 'ok' | 'insufficient_data';

/** Aggregated fleet health summary counts (matches backend FleetStatusSummary). */
export interface FleetStatusSummary {
  total: number;
  healthy: number;
  degraded: number;
  down: number;
  unknown: number;
  pct_healthy: number;
  avg_health_score: number;
}

/** Fleet status response. Backend nests the counts under `summary`. */
export interface FleetStatusResponse {
  summary: FleetStatusSummary;
  last_updated: string;
  live: boolean;
  source: string;
  note?: string | null;
}

/** Health metrics for a single agent (matches backend AgentHealthMetrics). */
export interface AgentHealthMetrics {
  latency_p50_ms: number;
  latency_p99_ms: number;
  error_rate_pct: number;
  invocations_24h: number;
  success_rate_pct: number;
}

/** Individual fleet agent health record (matches backend AgentHealthRecord). */
export interface FleetAgent {
  agent_id: string;
  agent_name: string;
  platform: string;
  status: AgentHealthStatus;
  health_score: number;
  metrics: AgentHealthMetrics;
  last_invocation?: string | null;
  last_health_check?: string | null;
  open_incidents: number;
  environment: 'prod' | 'pilot' | 'dev';
  region: string;
}

/** Fleet agents list response (matches backend FleetAgentsResponse). */
export interface FleetAgentResponse {
  agents: FleetAgent[];
  total: number;
  page: number;
  page_size: number;
  live: boolean;
  source: string;
  note?: string | null;
}

/** Detailed agent response (matches backend AgentDetailResponse). */
export interface AgentDetailResponse {
  agent: FleetAgent;
  recent_incidents: string[];
  recent_alerts: string[];
  live: boolean;
  source: string;
  note?: string | null;
}

/** Active alert mapped from a CloudWatch alarm (matches backend Alert). */
export interface Alert {
  /** The alarm NAME, not its ARN.
   *
   *  This changed: `id` used to carry the full alarm ARN, which defeated the point of
   *  masking `alarm_arn` - the unmasked ARN in `id` leaked the account id straight past
   *  `mask_account_id`. Treat this as an opaque name: do not parse it, split it on `:`,
   *  or read an account/region out of it. The backend's alert lookup still accepts an ARN
   *  tail for compatibility, so old links keep resolving, but nothing should send one. */
  id: string;
  alarm_name: string;
  /** Masked ARN, for display only. */
  alarm_arn?: string | null;
  state: AlarmState;
  severity: AlarmSeverity;
  metric_namespace: string;
  metric_name: string;
  dimensions: Record<string, string>;
  state_reason: string;
  state_updated?: string | null;
  acknowledged: boolean;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
  silenced_until?: string | null;
}

/** Active alerts response (matches backend ActiveAlertsResponse). */
export interface AlertListResponse {
  alerts: Alert[];
  total: number;
  critical_count: number;
  high_count: number;
  live: boolean;
  source: string;
  note?: string | null;
}

/** Where an alert acknowledgement or silence was actually stored.
 *
 *  `dynamodb` is the only durable outcome. `memory` means the write FAILED and the record
 *  dies on restart; `not-configured` means no operations table is configured at all.
 *  Both non-durable cases must surface to the user - they are not success. */
export type AlertStoreSource = 'dynamodb' | 'memory' | 'not-configured';

/** An acknowledged alert plus where the acknowledgement was stored
 *  (matches backend AlertAckResult).
 *
 *  `live: true` means exactly one thing: the acknowledgement row is durable. It is NOT a
 *  claim about the CloudWatch alarm, which the backend never modifies - it deliberately
 *  avoids SetAlarmState (which would falsify alarm history) and DisableAlarmActions
 *  (untimed, and silently disarms paging). UI copy must not imply the alarm was silenced
 *  or reset in AWS. */
export interface AlertAckResult extends Alert {
  live: boolean;
  source: AlertStoreSource;
  note?: string | null;
}

/** A stored alert silence (matches backend AlertSilence).
 *
 *  A silence is an AVA-side, time-bounded suppression that the backend applies when it
 *  builds the alert list. It does not touch the CloudWatch alarm. */
export interface AlertSilence {
  id: string;
  /** Glob matched against alarm names. */
  alarm_name_pattern: string;
  reason: string;
  created_by: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
}

/** Payload to create a silence (matches backend AlertSilenceCreate). */
export interface AlertSilenceCreate {
  alarm_name_pattern: string;
  reason: string;
  /**
   * Optional, and NOT how a browser caller should attribute a silence.
   *
   * The backend records the actor from the `x-user-email` request header that the
   * interceptor above already attaches to every call, and that header WINS over this
   * field - it is what the RBAC layer acts on, while this is only data the caller typed.
   * Left here solely so a header-less server-to-server caller can name itself.
   */
  created_by?: string;
  /** 1..10080 minutes (max 7 days). The backend rejects anything outside that range. */
  duration_minutes: number;
}

/** A silence plus where it was stored (matches backend AlertSilenceResult). */
export interface AlertSilenceResult extends AlertSilence {
  live: boolean;
  source: AlertStoreSource;
  note?: string | null;
}

/** Stored silences with provenance (matches backend AlertSilencesResponse). */
export interface AlertSilencesResponse {
  silences: AlertSilence[];
  total: number;
  active_count: number;
  live: boolean;
  source: string;
  note?: string | null;
}

/** Alert rule definition (matches backend AlertRule). */
export interface AlertRule {
  id: string;
  name: string;
  description?: string;
  metric_namespace: string;
  metric_name: string;
  dimensions: Record<string, string>;
  threshold: number;
  comparison: string;
  period_seconds: number;
  evaluation_periods: number;
  severity: AlarmSeverity;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** Alert rules response. */
export interface AlertRulesResponse {
  rules: AlertRule[];
  total: number;
  live: boolean;
  source: string;
  note?: string | null;
}

/** SLA definition. */
export interface SLA {
  id: string;
  name: string;
  description?: string;
  metric: string;
  target: number;
  current: number;
  unit: string;
  status: 'met' | 'at-risk' | 'breached';
  agent_ids?: string[];
  period: '24h' | '7d' | '30d' | 'monthly';
}

/** SLA compliance status for a single SLA (matches backend SLACompliance). */
export type SLAComplianceStatus = 'compliant' | 'at_risk' | 'breached';
export interface SLACompliance {
  sla_id: string;
  sla_name: string;
  target_value: number;
  current_value: number;
  status: SLAComplianceStatus;
  error_budget_remaining_pct: number;
  measurement_start: string;
  measurement_end: string;
  breaches_in_window: number;
}

/** SLA list response (matches backend SLAListResponse). */
export interface SLAListResponse {
  slas: SLACompliance[];
  total: number;
  compliant_count: number;
  at_risk_count: number;
  breached_count: number;
  overall_compliance_pct: number;
  live: boolean;
  source: string;
  note?: string | null;
}

/**
 * SLA target definition (matches backend SLATarget).
 *
 * NOTE: distinct from the legacy `SLA` interface above, which uses different field
 * names (`metric`/`target`/`unit`) and does not correspond to any current backend
 * model. Use `SLATarget` for anything touching `/operations/sla`.
 */
export interface SLATarget {
  id: string;
  name: string;
  description: string;
  /** availability | latency | error_rate | throughput */
  metric_type: string;
  target_value: number;
  /** percent | ms | count */
  target_unit: string;
  /** hourly | daily | weekly | monthly */
  measurement_window: string;
  services: string[];
  agents: string[];
  created_at: string;
  updated_at: string;
}

/** Payload to create an SLA target (matches backend SLATargetCreate). */
export interface SLATargetCreate {
  name: string;
  description?: string;
  /** availability | latency | error_rate | throughput */
  metric_type: string;
  target_value: number;
  /** percent | ms | count */
  target_unit?: string;
  /** hourly | daily | weekly | monthly */
  measurement_window?: string;
  services?: string[];
  agents?: string[];
}

/** SLA breach record (matches backend SLABreach). */
export interface SLABreach {
  id: string;
  sla_id: string;
  sla_name: string;
  breach_start: string;
  breach_end?: string | null;
  target_value: number;
  actual_value: number;
  impact_description: string;
  root_cause?: string | null;
  remediation?: string | null;
  /** Which SLA metric breached, and how severe. Optional — no writer populates
   *  them yet, so consumers must render "unknown" rather than guess. */
  metric_name?: string | null;
  /** critical | high | medium | low */
  severity?: string | null;
  acknowledged: boolean;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
}

/**
 * Error budget position for a single SLA (matches backend SLAErrorBudget).
 *
 * `remaining_pct` comes straight from the SLA compliance calculation, not a
 * recomputation. Budget minutes are only derivable for availability SLAs, and
 * burn rate / trend / projected exhaustion / history need a historical store
 * that does not exist yet — hence optional rather than invented.
 */
export interface SLAErrorBudget {
  sla_id: string;
  sla_name: string;
  metric_type: string;
  measurement_window: string;
  target_value: number;
  current_value: number;
  remaining_pct: number;
  measurement_start: string;
  measurement_end: string;
  total_budget_minutes?: number | null;
  used_budget_minutes?: number | null;
  burn_rate?: number | null;
  /** increasing | stable | decreasing (needs history) */
  burn_rate_trend?: string | null;
  projected_exhaustion?: string | null;
  /** Burn-down history points — empty until a historical store exists. */
  history: Record<string, unknown>[];
}

/** SLA error-budget response (matches backend SLAErrorBudgetsResponse). */
export interface SLAErrorBudgetsResponse {
  budgets: SLAErrorBudget[];
  total: number;
  avg_remaining_pct?: number | null;
  live: boolean;
  source: string;
  note?: string | null;
}

/** SLA breaches response (matches backend SLABreachesResponse). */
export interface SLABreachResponse {
  breaches: SLABreach[];
  total: number;
  live: boolean;
  source: string;
  note?: string | null;
}

/** SLA compliance report (matches backend SLAComplianceReportResponse). */
export interface SLAComplianceResponse {
  report_period_start: string;
  report_period_end: string;
  slas: SLACompliance[];
  overall_compliance_pct: number;
  total_breaches: number;
  /** null when no SLA was evaluated. Was typed `number` against a backend default of 100.0,
   *  which reported a full error budget remaining for the case where nothing was measured. */
  avg_error_budget_remaining_pct: number | null;
  live: boolean;
  source: string;
  note?: string | null;
}

/** On-call schedule. */
/** Person on call (matches backend OnCallPerson). */
export interface OnCallPerson {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  escalation_level: number;
}

/** Current on-call response (matches backend CurrentOnCallResponse). */
export interface OnCallResponse {
  primary?: OnCallPerson | null;
  secondary?: OnCallPerson | null;
  escalation_policy?: string | null;
  schedule_name?: string | null;
  shift_ends_at?: string | null;
  live: boolean;
  source: string;
  note?: string | null;
}

/** Escalation policy (matches backend EscalationPolicy). */
export interface EscalationPolicy {
  id: string;
  name: string;
  description?: string;
  levels: Record<string, unknown>[];
  repeat_enabled?: boolean;
  repeat_after_minutes?: number;
  created_at?: string;
}

/** Escalation policies response. */
export interface EscalationPoliciesResponse {
  policies: EscalationPolicy[];
  total: number;
  live: boolean;
  source: string;
  note?: string | null;
}

/** Change record. */
export interface Change {
  id: string;
  title: string;
  description: string;
  type: ChangeType;
  status: ChangeStatus;
  agent_id?: string;
  agent_name?: string;
  requested_by: string;
  requested_at: string;
  approved_by?: string;
  approved_at?: string;
  deployed_at?: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  rollback_available: boolean;
}

/** Change list response. */
export interface ChangeListResponse {
  changes: Change[];
  total: number;
  page: number;
  page_size: number;
  live: boolean;
  source: string;
  note?: string | null;
}

/** Pending approvals response. */
export interface PendingApprovalsResponse {
  approvals: Change[];
  total: number;
  live: boolean;
  source: string;
  note?: string | null;
}

/** Single point in a metric trend (matches backend MetricsTrendPoint). */
export interface MetricsTrendPoint {
  timestamp: string;
  value: number;
  label?: string | null;
}

/** Trend data for a single metric (matches backend MetricsTrend). */
export interface MetricsTrend {
  metric_name: string;
  unit: string;
  points: MetricsTrendPoint[];
}

/** Ops trends response (matches backend MetricsTrendsResponse). */
export interface OpsTrendsResponse {
  trends: MetricsTrend[];
  period_start: string;
  period_end: string;
  live: boolean;
  source: string;
  note?: string | null;
}

/** Operations metrics summary values (matches backend OperationsMetricsSummary). */
export interface OperationsMetricsSummary {
  mttr_minutes: number;
  /** null when no incident carries a detection latency. Nothing in the platform
   *  measures detection onset today, so this is null in practice. Never render 0
   *  as a "good" MTTD. */
  mttd_minutes: number | null;
  cfr_pct: number;
  /**
   * Share of discovered agents reporting healthy RIGHT NOW - a snapshot, not uptime
   * over a window. Nothing in the platform samples agent health over time, so this
   * number carries no measurement period despite sitting next to 30-day metrics.
   *
   * null when there was nothing to measure: no agents discovered, or every agent's
   * health resolved to UNKNOWN (the current state). Render `—`, never 0 (reads as a
   * total outage) and never 100 (reads as a perfectly healthy unexamined fleet).
   */
  availability_pct: number | null;
  incident_count_30d: number;
  change_count_30d: number;
  alert_count_24h: number;
  /**
   * Null when no SLA targets are defined — there is nothing to measure, so the
   * backend sends `null` rather than `0.0`, which rendered as a green "0% SLA
   * Compliance" under a Live badge. Render `—`, never coerce to a number.
   */
  sla_compliance_pct: number | null;
  measurement_period_days: number;
}

/**
 * Operations metrics summary response (matches backend MetricsSummaryResponse).
 *
 * The backend nests the KPI values under `summary`. The optional dashboard fields
 * below are NOT populated by the backend (they have no live source yet), so they
 * remain undefined when live and the OpsOverview sections that read them fall back
 * to their demo/mock content rather than rendering fabricated data under a Live pill.
 */
export interface OpsMetricsSummaryResponse {
  summary: OperationsMetricsSummary;
  frameworkCompliance?: Array<{
    framework: string;
    status: 'compliant' | 'at-risk' | 'in-progress';
    controlsPassed: number;
    controlsTotal: number;
    nextAudit: string;
  }>;
  riskTrend7d?: Array<{ day: string; score: number }>;
  upcomingDeadlines?: Array<{
    title: string;
    dueDate: string;
    daysLeft: number;
    priority: 'high' | 'medium' | 'low';
  }>;
  policyViolations?: Array<{
    policy: string;
    agent: string;
    count: number;
    lastOccurrence: string;
  }>;
  trend24h?: Array<{
    hour: string;
    incidents: number;
    alerts: number;
    availability: number;
  }>;
  live: boolean;
  source: string;
  note?: string | null;
}

/** Capacity quotas response (matches backend CapacityQuotasResponse envelope).
 *  NOTE: backend quota elements (QuotaUsage) carry `region` instead of `status`;
 *  the shared ServiceQuota element is retained here and is not read by the live UI. */
export interface CapacityQuotasResponse {
  quotas: ServiceQuota[];
  total: number;
  critical_count: number;
  warning_count: number;
  live: boolean;
  source: string;
  note?: string | null;
}

/** Capacity alerts response (matches backend CapacityAlertsResponse envelope). */
export interface CapacityAlertsResponse {
  alerts: CapacityAlert[];
  total: number;
  live: boolean;
  source: string;
  note?: string | null;
}

/** Request to create an incident. */
export interface IncidentCreateRequest {
  title: string;
  description: string;
  severity: IncidentSeverity;
  owner: string;
  affected_agents?: string[];
  linked_alert_id?: string;
}

/** Request to update an incident. */
export interface IncidentUpdateRequest {
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  owner?: string;
  resolution_notes?: string;
}

/** Request to add a timeline event. */
export interface TimelineEventRequest {
  type: 'comment' | 'action';
  description: string;
  actor?: string;
  metadata?: Record<string, string>;
}

/** Request to create a change. */
export interface ChangeCreateRequest {
  title: string;
  description: string;
  type: ChangeType;
  agent_id?: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Govern Operations API - Fleet health, alerts, SLAs, on-call, changes.
 *
 * Base path is the backend router prefix `/api/v1/govern/operations`.
 * Live sources: `fleet/*` (Bedrock + CloudWatch), `alerts/active` (CloudWatch
 * alarms) and `capacity/*` (Service Quotas). The `incidents`, `sla`, `oncall`
 * and `changes` endpoints are backed by DynamoDB that is currently empty and
 * return `live:false`, so consumers keep their mock/empty fallbacks for those.
 */
export const governOperationsApi = {
  // Fleet Health
  /** Get fleet status summary. GET /operations/fleet/status */
  fleetStatus: async (): Promise<FleetStatusResponse> =>
    (await client.get("/api/v1/govern/operations/fleet/status")).data,

  /** List fleet agents. GET /operations/fleet/agents (backend honours page/page_size/status). */
  fleetAgents: async (filters?: {
    status?: FleetAgentStatus;
    provider?: 'AWS' | 'Azure' | 'GCP';
    search?: string;
    sortBy?: 'name' | 'status' | 'latency' | 'errorRate' | 'invocations';
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  }): Promise<FleetAgentResponse> =>
    (await client.get("/api/v1/govern/operations/fleet/agents", { params: filters })).data,

  /** Get agent detail. GET /operations/fleet/agents/{id} */
  agentDetail: async (agentId: string): Promise<AgentDetailResponse> =>
    (await client.get(`/api/v1/govern/operations/fleet/agents/${encodeURIComponent(agentId)}`)).data,

  // Alerts
  /** Get active CloudWatch alarms. GET /operations/alerts/active (backend takes no query params). */
  activeAlerts: async (filters?: {
    severity?: AlertSeverity;
    acknowledged?: boolean;
    agentId?: string;
    limit?: number;
  }): Promise<AlertListResponse> =>
    (await client.get("/api/v1/govern/operations/alerts/active", { params: filters })).data,

  /** Get custom alert rules (DynamoDB). GET /operations/alerts/rules */
  alertRules: async (): Promise<AlertRulesResponse> =>
    (await client.get("/api/v1/govern/operations/alerts/rules")).data,

  /** Acknowledge an alert. PATCH /operations/alerts/{id}/acknowledge (OPERATOR, no body -
   *  the backend infers the actor).
   *
   *  `alertId` is the alarm NAME (see Alert.id). Throws 404 when no alarm currently in
   *  ALARM state matches. Check `live`/`source` on the result: `dynamodb` means the ack is
   *  durable, `memory`/`not-configured` mean the write failed and it is not. */
  acknowledgeAlert: async (alertId: string): Promise<AlertAckResult> =>
    (await client.patch(`/api/v1/govern/operations/alerts/${encodeURIComponent(alertId)}/acknowledge`)).data,

  /** Create an alert silence. POST /operations/alerts/silences (OPERATOR, 201). */
  createSilence: async (data: AlertSilenceCreate): Promise<AlertSilenceResult> =>
    (await client.post("/api/v1/govern/operations/alerts/silences", data)).data,

  /** List stored silences. GET /operations/alerts/silences (VIEWER).
   *  Active only by default; `includeExpired` also returns ones that have ended. */
  silences: async (includeExpired = false): Promise<AlertSilencesResponse> =>
    (await client.get("/api/v1/govern/operations/alerts/silences", {
      params: { include_expired: includeExpired },
    })).data,

  /** End a silence now. DELETE /operations/alerts/silences/{id} (OPERATOR).
   *
   *  Despite the verb this ENDS the silence rather than removing the record: the backend
   *  updates the row in place and returns it with `ends_at` moved to now, so it keeps
   *  appearing under `silences(true)`. Say "ended", not "deleted".
   *
   *  Idempotent - ending an already-ended silence returns that record instead of failing.
   *  A 404 therefore means the id does not exist at all, which is a different thing. */
  expireSilence: async (silenceId: string): Promise<AlertSilenceResult> =>
    (await client.delete(
      `/api/v1/govern/operations/alerts/silences/${encodeURIComponent(silenceId)}`
    )).data,

  /** Create an alert rule. POST /operations/alerts/rules.
   *  NOTE: backend expects AlertRuleCreate (metric_namespace/metric_name/comparison/...);
   *  this legacy payload differs and is not exercised by the live UI. */
  createAlertRule: async (data: {
    name: string;
    description?: string;
    condition: string;
    threshold: number;
    severity: AlertSeverity;
    agentPatterns?: string[];
    enabled?: boolean;
  }): Promise<AlertRule> =>
    (await client.post("/api/v1/govern/operations/alerts/rules", data)).data,

  // Incidents
  // These are the ONLY working incident endpoints. They hit the operations incidents
  // store, a real DynamoDB table (snake_case `Incident` on the backend), so an empty
  // response is a measured zero rather than an unreachable store.
  //
  // The previous note here claimed "the live incident UI uses governIncidentApi" and that
  // these ops variants therefore stay gated to mock/empty in OpsOverview. Both halves were
  // false: governIncidentApi had no importers and its paths 404'd, so it was never the live
  // path for anything. It has been removed - see the comment at its former definition above.
  /** List incidents. GET /operations/incidents */
  incidents: async (filters?: {
    status?: IncidentStatus;
    severity?: IncidentSeverity;
    agentId?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }): Promise<IncidentListResponse> =>
    (await client.get("/api/v1/govern/operations/incidents", { params: filters })).data,

  /** Get incident detail. GET /operations/incidents/{id} */
  incidentDetail: async (incidentId: string): Promise<IncidentDetailResponse> =>
    (await client.get(`/api/v1/govern/operations/incidents/${encodeURIComponent(incidentId)}`)).data,

  /** Create an incident. POST /operations/incidents.
   *  NOTE: backend returns the Incident record directly (snake_case), not this wrapper. */
  createIncident: async (data: IncidentCreateRequest): Promise<IncidentMutationResponse> =>
    (await client.post("/api/v1/govern/operations/incidents", data)).data,

  /** Update an incident. PATCH /operations/incidents/{id} */
  updateIncident: async (id: string, data: IncidentUpdateRequest): Promise<IncidentMutationResponse> =>
    (await client.patch(`/api/v1/govern/operations/incidents/${encodeURIComponent(id)}`, data)).data,

  /** Add timeline event to incident. POST /operations/incidents/{id}/timeline */
  addTimelineEvent: async (incidentId: string, event: TimelineEventRequest): Promise<IncidentMutationResponse> =>
    (await client.post(`/api/v1/govern/operations/incidents/${encodeURIComponent(incidentId)}/timeline`, event)).data,

  // SLAs
  /** List SLAs with compliance. GET /operations/sla */
  slas: async (): Promise<SLAListResponse> =>
    (await client.get("/api/v1/govern/operations/sla")).data,

  /** Get SLA breaches. GET /operations/sla/breaches (backend takes `days`). */
  slaBreaches: async (days = 30): Promise<SLABreachResponse> =>
    (await client.get("/api/v1/govern/operations/sla/breaches", { params: { days } })).data,

  /** Get SLA compliance report. GET /operations/sla/compliance (backend takes `days`). */
  slaCompliance: async (period: '7d' | '30d' | '90d' = '30d'): Promise<SLAComplianceResponse> => {
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    return (await client.get("/api/v1/govern/operations/sla/compliance", { params: { days } })).data;
  },

  /** Get SLA error budgets. GET /operations/sla/error-budgets
   *  Registered BEFORE `GET /sla/{sla_id}` on the backend so the literal path wins. */
  slaErrorBudgets: async (): Promise<SLAErrorBudgetsResponse> =>
    (await client.get("/api/v1/govern/operations/sla/error-budgets")).data,

  /** Create an SLA target. POST /operations/sla (201, ADMIN). */
  createSla: async (data: SLATargetCreate): Promise<SLATarget> =>
    (await client.post("/api/v1/govern/operations/sla", data)).data,

  /** Acknowledge an SLA breach. PATCH /operations/sla/breaches/{id}/acknowledge
   *  (OPERATOR; backend infers the actor, so no body). */
  acknowledgeSlaBreach: async (breachId: string): Promise<SLABreach> =>
    (await client.patch(`/api/v1/govern/operations/sla/breaches/${encodeURIComponent(breachId)}/acknowledge`)).data,

  /** Resolve an SLA breach. PATCH /operations/sla/breaches/{id}/resolve (OPERATOR). */
  resolveSlaBreach: async (breachId: string, resolutionNotes = ''): Promise<SLABreach> =>
    (await client.patch(
      `/api/v1/govern/operations/sla/breaches/${encodeURIComponent(breachId)}/resolve`,
      { resolution_notes: resolutionNotes },
    )).data,

  // On-Call
  /** Get current on-call. GET /operations/oncall/current */
  onCall: async (): Promise<OnCallResponse> =>
    (await client.get("/api/v1/govern/operations/oncall/current")).data,

  /** Get escalation policies. GET /operations/oncall/policies */
  escalationPolicies: async (): Promise<EscalationPoliciesResponse> =>
    (await client.get("/api/v1/govern/operations/oncall/policies")).data,

  // Changes
  // NOTE: backend ChangeRecord is snake_case (change_type, affected_*, notes, ...)
  // and the store is currently empty; the camelCase Change type below is shared
  // with the marketplace approvals view, so it is left as-is and these change
  // endpoints stay gated to mock/empty in the UI.
  /** Get change log. GET /operations/changes */
  changes: async (filters?: {
    status?: ChangeStatus;
    type?: ChangeType;
    agentId?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }): Promise<ChangeListResponse> =>
    (await client.get("/api/v1/govern/operations/changes", { params: filters })).data,

  /** Get pending changes. GET /operations/changes/pending.
   *  NOTE: backend returns { changes: ChangeRecord[], ... }; this shared type is not
   *  read by the live UI. */
  pendingApprovals: async (): Promise<PendingApprovalsResponse> =>
    (await client.get("/api/v1/govern/operations/changes/pending")).data,

  /** Create a change record. POST /operations/changes */
  createChange: async (data: ChangeCreateRequest): Promise<Change> =>
    (await client.post("/api/v1/govern/operations/changes", data)).data,

  /** Approve a change. UNIMPLEMENTED: no matching backend route exists under
   *  /operations/changes; kept for API symmetry only and never wired to the UI. */
  approveChange: async (changeId: string, approvedBy: string, comment?: string): Promise<Change> =>
    (await client.post(`/api/v1/govern/operations/changes/${encodeURIComponent(changeId)}/approve`, { approved_by: approvedBy, comment })).data,

  /** Reject a change. UNIMPLEMENTED: no matching backend route exists under
   *  /operations/changes; kept for API symmetry only and never wired to the UI. */
  rejectChange: async (changeId: string, rejectedBy: string, reason: string): Promise<Change> =>
    (await client.post(`/api/v1/govern/operations/changes/${encodeURIComponent(changeId)}/reject`, { rejected_by: rejectedBy, reason })).data,

  // Metrics & Trends
  /** Get key operations metrics. GET /operations/metrics/summary (KPIs nested under `summary`). */
  opsMetrics: async (): Promise<OpsMetricsSummaryResponse> =>
    (await client.get("/api/v1/govern/operations/metrics/summary")).data,

  /** Get historical metric trends. GET /operations/metrics/trends (backend takes `days`). */
  opsTrends: async (period: '7d' | '30d' | '90d' = '30d'): Promise<OpsTrendsResponse> => {
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    return (await client.get("/api/v1/govern/operations/metrics/trends", { params: { days } })).data;
  },

  // Capacity
  /** Get capacity quotas. GET /operations/capacity/quotas */
  capacityQuotas: async (): Promise<CapacityQuotasResponse> =>
    (await client.get("/api/v1/govern/operations/capacity/quotas")).data,

  /** Get capacity alerts. GET /operations/capacity/alerts */
  capacityAlerts: async (): Promise<CapacityAlertsResponse> =>
    (await client.get("/api/v1/govern/operations/capacity/alerts")).data,

  // ── SSM Fleet Manager (READ-ONLY; execution is intentionally NOT exposed) ──
  /** SSM managed-instance fleet. GET /operations/ssm/managed-instances */
  ssmManagedInstances: async (): Promise<SsmManagedInstancesResponse> =>
    (await client.get("/api/v1/govern/operations/ssm/managed-instances")).data,
  /** SSM document/runbook catalog. GET /operations/ssm/runbooks */
  ssmRunbooks: async (): Promise<SsmRunbooksResponse> =>
    (await client.get("/api/v1/govern/operations/ssm/runbooks")).data,
  /** SSM command execution history. GET /operations/ssm/command-history */
  ssmCommandHistory: async (days = 7): Promise<SsmCommandHistoryResponse> =>
    (await client.get("/api/v1/govern/operations/ssm/command-history", { params: { days } })).data,
};

// ── SSM Fleet Manager read-only shapes ──
export interface SsmManagedInstance {
  instance_id: string;
  name?: string | null;
  ping_status: string;
  platform_type?: string | null;
  platform_name?: string | null;
  agent_version?: string | null;
  ip_address?: string | null;
  resource_type?: string | null;
  last_ping_at?: string | null;
}
export interface SsmManagedInstancesResponse {
  instances: SsmManagedInstance[];
  total: number;
  online_count: number;
  live: boolean;
  source: string;
  note?: string | null;
}
export interface SsmRunbookDoc {
  name: string;
  document_type: string;
  document_format?: string | null;
  owner?: string | null;
  platform_types: string[];
  target_type?: string | null;
  default_version?: string | null;
}
export interface SsmRunbooksResponse {
  runbooks: SsmRunbookDoc[];
  total: number;
  command_count: number;
  automation_count: number;
  live: boolean;
  source: string;
  note?: string | null;
}
export interface SsmCommandRecord {
  command_id: string;
  document_name: string;
  status: string;
  targets_count: number;
  requested_at?: string | null;
  completed_at?: string | null;
  comment?: string | null;
  error_count?: number | null;
}
export interface SsmCommandHistoryResponse {
  commands: SsmCommandRecord[];
  total: number;
  live: boolean;
  source: string;
  note?: string | null;
}

// =============================================================================
// Govern Marketplace API
// =============================================================================

export type ResourceType = 'agent' | 'mcp_server' | 'a2a_agent' | 'knowledge_base' | 'skill' | 'harness' | 'model';
export type ListingVisibility = 'internal' | 'team' | 'restricted';
export type ApprovalMode = 'require_approval' | 'auto_approve' | 'deny';
export type ListingStatus = 'draft' | 'published' | 'deprecated' | 'archived';
export type SubscriptionStatus = 'pending' | 'active' | 'revoked' | 'expired' | 'denied';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ListingMetadata {
  capabilities: string[];
  use_cases: string[];
  limitations: string[];
  documentation_url?: string;
  support_contact?: string;
  sla_tier?: string;
  tags: string[];
}

export interface CostInfo {
  cost_model: string;
  estimated_cost_per_1k?: number;
  cost_center_required: boolean;
  billing_code?: string;
}

export interface ApprovalStep {
  step_number: number;
  approver_type: string;
  approved_by?: string;
  approved_at?: string;
  status: 'pending' | 'approved' | 'denied';
}

export interface RecertificationConfig {
  enabled: boolean;
  interval_days: number;
  grace_period_days: number;
}

export interface MarketplaceListing {
  id: string;
  name: string;
  description: string;
  resource_type: ResourceType;
  resource_id: string;
  owner_team: string;
  owner_email?: string;
  visibility: ListingVisibility;
  approval_mode: ApprovalMode;
  risk_level: RiskLevel;
  allowed_teams: string[];
  metadata: ListingMetadata;
  cost_info: CostInfo;
  category: string;
  featured: boolean;
  status: ListingStatus;
  created_at: string;
  updated_at: string;
  published_at?: string;
  created_by?: string;
  subscriber_count: number;
  total_invocations: number;
  avg_rating?: number;
  required_guardrail_ids?: string[];
  required_policy_engine_id?: string;
  data_classification?: string;
  compliance_frameworks?: string[];
  requires_attestation?: boolean;
  attestation_text?: string;
  rate_limit_per_minute?: number;
  rate_limit_per_day?: number;
  default_budget_limit?: number;
  recertification?: RecertificationConfig;
}

export interface CatalogItem {
  id: string;
  name: string;
  description: string;
  resource_type: ResourceType;
  resource_id: string;
  owner_team: string;
  category: string;
  featured: boolean;
  risk_level: RiskLevel;
  capabilities: string[];
  tags: string[];
  approval_mode: ApprovalMode;
  cost_model: string;
  estimated_cost_per_1k?: number;
  sla_tier?: string;
  subscriber_count: number;
  avg_rating?: number;
  user_subscription_status?: SubscriptionStatus;
  user_subscription_id?: string;
}

export interface UsageMetrics {
  total_invocations: number;
  total_tokens: number;
  total_cost: number;
  last_invocation?: string;
  invocations_30d: number;
  cost_30d: number;
}

export interface Subscription {
  id: string;
  listing_id: string;
  user_id: string;
  user_email: string;
  business_unit: string;
  cost_center: string;
  justification: string;
  requested_access_level: string;
  status: SubscriptionStatus;
  resource_type?: ResourceType;
  resource_id?: string;
  listing_name?: string;
  created_at: string;
  updated_at: string;
  approved_at?: string;
  expires_at?: string;
  revoked_at?: string;
  approved_by?: string;
  denied_by?: string;
  denial_reason?: string;
  usage: UsageMetrics;
  approval_chain?: ApprovalStep[];
  current_approval_step?: number;
  attestation_accepted?: boolean;
  attestation_accepted_at?: string;
  budget_limit?: number;
  budget_spent_this_month?: number;
  budget_alert_threshold?: number;
  rate_limit_per_minute?: number;
  rate_limit_per_day?: number;
  invocations_this_minute?: number;
  invocations_today?: number;
  last_rate_reset?: string;
  last_recertification?: string;
  next_recertification_due?: string;
  recertification_reminder_sent?: boolean;
}

export interface ListingsResponse {
  listings: MarketplaceListing[];
  total: number;
  page: number;
  page_size: number;
  live: boolean;
  source: string;
  note?: string;
}

export interface CatalogResponse {
  items: CatalogItem[];
  total: number;
  page: number;
  page_size: number;
  categories: string[];
  resource_types: string[];
  live: boolean;
  source: string;
  note?: string;
}

export interface CatalogItemDetailResponse {
  item: CatalogItem;
  full_description: string;
  use_cases: string[];
  limitations: string[];
  documentation_url?: string;
  support_contact?: string;
  related_items: CatalogItem[];
  live: boolean;
  source: string;
  note?: string;
}

export interface MySubscriptionsResponse {
  subscriptions: Subscription[];
  total: number;
  active_count: number;
  pending_count: number;
  total_cost_30d: number;
  live: boolean;
  source: string;
  note?: string;
}

export interface PendingApprovalsResponse {
  subscriptions: Subscription[];
  total: number;
  by_resource_type: Record<string, number>;
  live: boolean;
  source: string;
  note?: string | null;
}

export interface AdminSubscriptionsResponse {
  subscriptions: Subscription[];
  total: number;
  active_count: number;
  pending_count: number;
  revoked_count: number;
  expired_count: number;
  denied_count: number;
  live: boolean;
  source: string;
  note?: string;
}

export interface UsageByBusinessUnit {
  business_unit: string;
  subscriber_count: number;
  total_invocations_30d: number;
  total_cost_30d: number;
  top_resources: string[];
}

export interface UsageByResource {
  listing_id: string;
  listing_name: string;
  resource_type: ResourceType;
  subscriber_count: number;
  total_invocations_30d: number;
  total_cost_30d: number;
  top_business_units: string[];
}

export interface UsageAnalyticsResponse {
  period_start: string;
  period_end: string;
  total_subscribers: number;
  total_invocations: number;
  total_cost: number;
  by_business_unit: UsageByBusinessUnit[];
  by_resource: UsageByResource[];
  live: boolean;
  source: string;
  note?: string;
}

export interface EntitlementResult {
  entitled: boolean;
  subscription_id?: string;
  access_level?: string;
  expires_at?: string;
  reason: string;
}

export const governMarketplaceApi = {
  // Listing Management (Admin)
  /** Create a new marketplace listing. */
  createListing: async (data: Partial<MarketplaceListing>): Promise<MarketplaceListing> =>
    (await client.post("/api/v1/govern/marketplace/listings", data)).data,

  /** List all marketplace listings (admin view). */
  listListings: async (params?: { status?: ListingStatus; page?: number; page_size?: number }): Promise<ListingsResponse> =>
    (await client.get("/api/v1/govern/marketplace/listings", { params })).data,

  /** Get a listing by ID. */
  getListing: async (listingId: string): Promise<{ listing: MarketplaceListing }> =>
    (await client.get(`/api/v1/govern/marketplace/listings/${encodeURIComponent(listingId)}`)).data,

  /** Update a marketplace listing. */
  updateListing: async (listingId: string, data: Partial<MarketplaceListing>): Promise<MarketplaceListing> =>
    (await client.put(`/api/v1/govern/marketplace/listings/${encodeURIComponent(listingId)}`, data)).data,

  /** Delete a marketplace listing. */
  deleteListing: async (listingId: string): Promise<MarketplaceListing> =>
    (await client.delete(`/api/v1/govern/marketplace/listings/${encodeURIComponent(listingId)}`)).data,

  /** Publish a listing. */
  publishListing: async (listingId: string): Promise<MarketplaceListing> =>
    (await client.post(`/api/v1/govern/marketplace/listings/${encodeURIComponent(listingId)}/publish`)).data,

  /** Unpublish a listing. */
  unpublishListing: async (listingId: string): Promise<MarketplaceListing> =>
    (await client.post(`/api/v1/govern/marketplace/listings/${encodeURIComponent(listingId)}/unpublish`)).data,

  /** Deprecate a listing. */
  deprecateListing: async (listingId: string): Promise<MarketplaceListing> =>
    (await client.post(`/api/v1/govern/marketplace/listings/${encodeURIComponent(listingId)}/deprecate`)).data,

  // Catalog (Consumer View)
  /** Browse the marketplace catalog. */
  browseCatalog: async (params?: {
    resource_type?: ResourceType;
    category?: string;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<CatalogResponse> =>
    (await client.get("/api/v1/govern/marketplace/catalog", { params })).data,

  /** Get catalog item detail. */
  getCatalogItem: async (listingId: string): Promise<CatalogItemDetailResponse> =>
    (await client.get(`/api/v1/govern/marketplace/catalog/${encodeURIComponent(listingId)}`)).data,

  // Subscription Management
  /** Request a subscription to a resource. */
  requestSubscription: async (data: {
    listing_id: string;
    business_unit: string;
    cost_center: string;
    justification?: string;
    requested_access_level?: string;
  }): Promise<{ subscription: Subscription; note?: string }> =>
    (await client.post("/api/v1/govern/marketplace/subscriptions", {
      ...data,
      user_id: "", // Will be overridden by backend
      user_email: "", // Will be overridden by backend
    })).data,

  /** Get current user's subscriptions. */
  getMySubscriptions: async (): Promise<MySubscriptionsResponse> =>
    (await client.get("/api/v1/govern/marketplace/subscriptions/mine")).data,

  /** Get pending subscription approvals. */
  getPendingApprovals: async (): Promise<PendingApprovalsResponse> =>
    (await client.get("/api/v1/govern/marketplace/subscriptions/pending")).data,

  /** Get all subscriptions (admin view). */
  getAdminSubscriptions: async (params?: {
    status?: SubscriptionStatus;
    page?: number;
    page_size?: number;
  }): Promise<AdminSubscriptionsResponse> =>
    (await client.get("/api/v1/govern/marketplace/subscriptions/admin", { params })).data,

  /** Get a subscription by ID. */
  getSubscription: async (subscriptionId: string): Promise<{ subscription: Subscription; listing?: MarketplaceListing }> =>
    (await client.get(`/api/v1/govern/marketplace/subscriptions/${encodeURIComponent(subscriptionId)}`)).data,

  /** Approve a subscription request. */
  approveSubscription: async (subscriptionId: string, data: {
    approved_by: string;
    expires_in_days?: number;
    notes?: string;
  }): Promise<Subscription> =>
    (await client.post(`/api/v1/govern/marketplace/subscriptions/${encodeURIComponent(subscriptionId)}/approve`, data)).data,

  /** Deny a subscription request. */
  denySubscription: async (subscriptionId: string, data: {
    denied_by: string;
    reason: string;
  }): Promise<Subscription> =>
    (await client.post(`/api/v1/govern/marketplace/subscriptions/${encodeURIComponent(subscriptionId)}/deny`, data)).data,

  /** Revoke an active subscription. */
  revokeSubscription: async (subscriptionId: string, reason?: string): Promise<Subscription> =>
    (await client.post(`/api/v1/govern/marketplace/subscriptions/${encodeURIComponent(subscriptionId)}/revoke`, null, {
      params: { reason },
    })).data,

  /** Unsubscribe from a resource (user action). */
  unsubscribe: async (subscriptionId: string): Promise<{ status: string; subscription_id: string }> =>
    (await client.delete(`/api/v1/govern/marketplace/subscriptions/${encodeURIComponent(subscriptionId)}`)).data,

  // Entitlement Check
  /** Check if a user has entitlement to a resource. */
  checkEntitlement: async (data: {
    user_id: string;
    resource_type: ResourceType;
    resource_id: string;
  }): Promise<EntitlementResult> =>
    (await client.post("/api/v1/govern/marketplace/entitlement/check", data)).data,

  // Usage Analytics
  /** Get usage analytics. */
  getUsageAnalytics: async (days?: number): Promise<UsageAnalyticsResponse> =>
    (await client.get("/api/v1/govern/marketplace/analytics/usage", { params: { days } })).data,

  /** Record usage for a subscription (internal/gateway use). */
  recordUsage: async (subscriptionId: string, data: {
    invocations?: number;
    tokens?: number;
    cost?: number;
  }): Promise<{ status: string; subscription_id: string }> =>
    (await client.post(`/api/v1/govern/marketplace/subscriptions/${encodeURIComponent(subscriptionId)}/usage`, null, {
      params: data,
    })).data,
};

// ─── Govern SageMaker — live SageMaker model registry, endpoints, model cards ───
export interface AwsSageMakerModel { model_name: string; model_arn: string; creation_time?: string | null; enable_network_isolation: boolean; }
export interface AwsSageMakerModelsResponse { models: AwsSageMakerModel[]; total: number; live: boolean; source: string; note?: string | null; }

export interface AwsSageMakerEndpoint { endpoint_name: string; endpoint_arn: string; endpoint_status: string; creation_time?: string | null; last_modified_time?: string | null; }
export interface AwsSageMakerEndpointsResponse { endpoints: AwsSageMakerEndpoint[]; total: number; in_service: number; creating: number; updating: number; failed: number; live: boolean; source: string; note?: string | null; }

export interface AwsModelPackageSummary { model_package_name: string; model_package_arn: string; model_package_group_name?: string | null; model_package_version?: number | null; model_approval_status: string; model_package_status: string; creation_time?: string | null; }
export interface AwsModelRegistryResponse { packages: AwsModelPackageSummary[]; total: number; approved: number; pending_approval: number; rejected: number; live: boolean; source: string; note?: string | null; }

export interface AwsClarifyJob { job_name: string; job_arn: string; job_status: string; creation_time?: string | null; processing_end_time?: string | null; exit_message?: string | null; failure_reason?: string | null; }
export interface AwsClarifyJobsResponse { jobs: AwsClarifyJob[]; total: number; completed: number; in_progress: number; failed: number; live: boolean; source: string; note?: string | null; }

export interface AwsModelCard { model_card_name: string; model_card_arn: string; model_card_status: string; model_id?: string | null; creation_time?: string | null; last_modified_time?: string | null; security_config?: string | null; }
export interface AwsModelCardsResponse { cards: AwsModelCard[]; total: number; approved: number; pending_review: number; draft: number; archived: number; live: boolean; source: string; note?: string | null; }

export const governSageMakerApi = {
  models: async (maxResults = 100): Promise<AwsSageMakerModelsResponse> =>
    (await client.get("/api/v1/govern/sagemaker/models", { params: { max_results: maxResults } })).data,
  endpoints: async (maxResults = 100): Promise<AwsSageMakerEndpointsResponse> =>
    (await client.get("/api/v1/govern/sagemaker/endpoints", { params: { max_results: maxResults } })).data,
  modelRegistry: async (maxResults = 100): Promise<AwsModelRegistryResponse> =>
    (await client.get("/api/v1/govern/sagemaker/model-registry", { params: { max_results: maxResults } })).data,
  clarifyJobs: async (maxResults = 100): Promise<AwsClarifyJobsResponse> =>
    (await client.get("/api/v1/govern/sagemaker/clarify-jobs", { params: { max_results: maxResults } })).data,
  modelCards: async (maxResults = 100): Promise<AwsModelCardsResponse> =>
    (await client.get("/api/v1/govern/sagemaker/model-cards", { params: { max_results: maxResults } })).data,
  /** SageMaker Model Monitor data-quality drift (baseline vs captured). GET /sagemaker/model-monitor */
  modelMonitor: async (): Promise<AwsModelMonitorResponse> =>
    (await client.get("/api/v1/govern/sagemaker/model-monitor")).data,
};

// SageMaker Model Monitor — data-quality drift (baseline constraints vs captured data)
export interface SmDriftViolation { feature: string; check_type: string; description: string; }
export interface SmDriftFeatureStat { feature: string; baseline?: number | null; current?: number | null; drift_pct?: number | null; }
export interface AwsModelMonitorResponse {
  monitor_configured: boolean;
  monitored_endpoint?: string | null;
  baseline_features: number;
  violations: SmDriftViolation[];
  violations_count: number;
  feature_stats: SmDriftFeatureStat[];
  last_run_status?: string | null;
  last_run?: string | null;
  live: boolean;
  source: string;
  note?: string | null;
}

// Command Center Aggregator API
export interface CommandCenterData {
  security_posture: AwsSecurityPostureResponse | null;
  runtime_metrics: AwsModelMetricsResponse | null;
  config_compliance: AwsConfigCompliance | null;
  risk_posture: AwsRiskPostureResponse | null;
  ai_callers: AwsAiCallersResponse | null;
  eval_jobs: AwsEvaluationJobsResponse | null;
  invocation_safety: AwsInvocationSafetyResponse | null;
  cost_by_model: AwsCostModelBreakdown | null;
  budgets: AwsBudgetsResponse | null;
  anomalies: AwsCostAnomalies | null;
  agent_metrics: AwsAgentRuntimeMetricsResponse | null;
  policy_eval: PolicyEvaluationResult | null;
  live: boolean;
  live_sources: number;
  source: string;
  note?: string;
}

export const governCommandCenterApi = {
  /** Get all Command Center data in a single call. */
  getData: async (): Promise<CommandCenterData> =>
    (await client.get("/api/v1/govern/command-center/data")).data,
};

// ─── Govern X-Ray — distributed tracing for agent observability ───

export interface XRayTraceSummary {
  trace_id: string;
  duration?: number | null;
  response_time?: number | null;
  has_fault: boolean;
  has_error: boolean;
  has_throttle: boolean;
  is_partial: boolean;
  http_status?: number | null;
  http_method?: string | null;
  http_url?: string | null;
  service_ids: string[];
  annotations: Record<string, string>;
  users: string[];
}

export interface XRayTraceSummaryResponse {
  traces: XRayTraceSummary[];
  total: number;
  has_faults: number;
  has_errors: number;
  start_time: string;
  end_time: string;
  live: boolean;
  source: string;
  note?: string | null;
}

export interface XRayServiceNode {
  name: string;
  type: string;
  edges: string[];
  response_time_avg_ms?: number | null;
  error_rate?: number | null;
  throughput?: number | null;
}

export interface XRayServiceGraphResponse {
  services: XRayServiceNode[];
  start_time: string;
  end_time: string;
  live: boolean;
  source: string;
  note?: string | null;
}

export interface XRayTraceSegment {
  id: string;
  name: string;
  start_time: number;
  end_time?: number | null;
  duration_ms?: number | null;
  error: boolean;
  fault: boolean;
  annotations: Record<string, unknown>;
  metadata: Record<string, unknown>;
  subsegments: XRayTraceSegment[];
}

export interface XRayTraceDetail {
  trace_id: string;
  duration_ms?: number | null;
  segments: XRayTraceSegment[];
  live: boolean;
  source: string;
  note?: string | null;
}

export const governXRayApi = {
  /** Get recent trace summaries for agent invocations. */
  getTraceSummaries: async (hours = 1, filterExpression?: string): Promise<XRayTraceSummaryResponse> =>
    (await client.get("/api/v1/govern/xray/traces", {
      params: { hours, filter_expression: filterExpression },
    })).data,

  /** Get the service graph showing agent dependencies. */
  getServiceGraph: async (hours = 1): Promise<XRayServiceGraphResponse> =>
    (await client.get("/api/v1/govern/xray/service-graph", { params: { hours } })).data,

  /** Get detailed trace information for specific trace IDs. */
  getTraceDetails: async (traceIds: string[]): Promise<XRayTraceDetail[]> =>
    (await client.get("/api/v1/govern/xray/traces/detail", {
      params: { trace_ids: traceIds.join(",") },
    })).data,
};

// ─── Govern Audit Manager — AWS Audit Manager assessments and evidence ───

export interface AuditManagerAssessmentSummary {
  id: string;
  name: string;
  status: string;
  framework_id?: string | null;
  framework_name?: string | null;
  compliance_type?: string | null;
  created_at?: string | null;
  last_updated?: string | null;
  roles: string[];
}

export interface AuditManagerAssessmentDetail {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  framework_id?: string | null;
  framework_name?: string | null;
  compliance_type?: string | null;
  scope?: Record<string, unknown> | null;
  roles: string[];
  created_at?: string | null;
  last_updated?: string | null;
  assessment_reports_destination?: Record<string, unknown> | null;
}

export interface AuditManagerControlSet {
  id: string;
  name: string;
  status: string;
  roles: string[];
  total_evidence_count: number;
  controls_metadata_count: number;
}

export interface AuditManagerEvidenceFolder {
  id: string;
  name: string;
  date?: string | null;
  assessment_id: string;
  control_set_id: string;
  control_id?: string | null;
  control_name?: string | null;
  total_evidence: number;
  assessment_report_selection_count: number;
  author?: string | null;
}

export interface AuditManagerEvidenceItem {
  id: string;
  data_source: string;
  evidence_aws_account_id?: string | null;
  time?: string | null;
  event_source?: string | null;
  event_name?: string | null;
  evidence_by_type?: string | null;
  compliance_check?: string | null;
  iam_id?: string | null;
  attributes?: Record<string, unknown> | null;
}

export interface AuditManagerAssessmentsResponse {
  assessments: AuditManagerAssessmentSummary[];
  count: number;
  live: boolean;
  source: string;
  note?: string | null;
}

export interface AuditManagerControlSetsResponse {
  control_sets: AuditManagerControlSet[];
  assessment_id: string;
  count: number;
  live: boolean;
  source: string;
  note?: string | null;
}

export interface AuditManagerEvidenceFoldersResponse {
  evidence_folders: AuditManagerEvidenceFolder[];
  assessment_id: string;
  count: number;
  live: boolean;
  source: string;
  note?: string | null;
}

export interface AuditManagerEvidenceResponse {
  evidence: AuditManagerEvidenceItem[];
  folder_id: string;
  count: number;
  live: boolean;
  source: string;
  note?: string | null;
}

export const governAuditManagerApi = {
  /** List all AWS Audit Manager assessments. */
  assessments: async (): Promise<AuditManagerAssessmentsResponse> =>
    (await client.get("/api/v1/govern/audit-manager/assessments")).data,

  /** Get details for a specific assessment. */
  assessment: async (assessmentId: string): Promise<AuditManagerAssessmentDetail> =>
    (await client.get(`/api/v1/govern/audit-manager/assessments/${assessmentId}`)).data,

  /** Get control sets for an assessment. */
  controlSets: async (assessmentId: string): Promise<AuditManagerControlSetsResponse> =>
    (await client.get(`/api/v1/govern/audit-manager/assessments/${assessmentId}/control-sets`)).data,

  /** Get evidence folders for an assessment. */
  evidenceFolders: async (assessmentId: string): Promise<AuditManagerEvidenceFoldersResponse> =>
    (await client.get(`/api/v1/govern/audit-manager/assessments/${assessmentId}/evidence-folders`)).data,

  /** Get evidence items from a specific folder. */
  evidence: async (
    assessmentId: string,
    controlSetId: string,
    folderId: string,
    limit = 100
  ): Promise<AuditManagerEvidenceResponse> =>
    (await client.get(
      `/api/v1/govern/audit-manager/assessments/${assessmentId}/control-sets/${controlSetId}/evidence-folders/${folderId}/evidence`,
      { params: { limit } }
    )).data,
};

// ─────────────────── Bedrock Assets (Flows & Prompts) ───────────────────

export interface BedrockFlowSummary {
  id: string;
  name: string;
  arn: string;
  status: string;
  description?: string | null;
  version?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface BedrockFlowDetail extends BedrockFlowSummary {
  execution_role_arn?: string | null;
  definition?: Record<string, unknown> | null;
}

export interface BedrockPromptSummary {
  id: string;
  name: string;
  arn: string;
  version?: string | null;
  description?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface BedrockPromptDetail extends BedrockPromptSummary {
  default_variant?: string | null;
  variants?: Record<string, unknown>[] | null;
}

export interface BedrockFlowsResponse {
  flows: BedrockFlowSummary[];
  live: boolean;
  note?: string | null;
}

export interface BedrockFlowDetailResponse {
  flow: BedrockFlowDetail | null;
  live: boolean;
  note?: string | null;
}

export interface BedrockPromptsResponse {
  prompts: BedrockPromptSummary[];
  live: boolean;
  note?: string | null;
}

export interface BedrockPromptDetailResponse {
  prompt: BedrockPromptDetail | null;
  live: boolean;
  note?: string | null;
}

export interface BedrockAssetsOverviewResponse {
  flows_count: number;
  prompts_count: number;
  flows: BedrockFlowSummary[];
  prompts: BedrockPromptSummary[];
  live: boolean;
  note?: string | null;
}

export const governBedrockAssetsApi = {
  /** Get combined overview of all Bedrock Flows and Prompts. */
  overview: async (): Promise<BedrockAssetsOverviewResponse> =>
    (await client.get("/api/v1/govern/bedrock-assets/overview")).data,

  /** List all Bedrock Flows. */
  flows: async (): Promise<BedrockFlowsResponse> =>
    (await client.get("/api/v1/govern/bedrock-assets/flows")).data,

  /** Get details for a specific Bedrock Flow. */
  flow: async (flowId: string): Promise<BedrockFlowDetailResponse> =>
    (await client.get(`/api/v1/govern/bedrock-assets/flows/${flowId}`)).data,

  /** List all Bedrock Prompts. */
  prompts: async (): Promise<BedrockPromptsResponse> =>
    (await client.get("/api/v1/govern/bedrock-assets/prompts")).data,

  /** Get details for a specific Bedrock Prompt. */
  prompt: async (promptId: string): Promise<BedrockPromptDetailResponse> =>
    (await client.get(`/api/v1/govern/bedrock-assets/prompts/${promptId}`)).data,
};

// Transformation Value Model — Reference Catalog API -------------------------

export type CatalogEntityType =
  | 'industries'
  | 'industry-segments'
  | 'business-domains'
  | 'value-levers'
  | 'kpis'
  | 'solutions'
  | 'use-cases'
  | 'data-assets'
  | 'technology-components';

export interface CatalogEntity {
  id: string;
  source_ref?: string | null;
  name: string;
  description?: string | null;
  status?: string | null;
  tags?: string[] | null;
  version_no: number;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  relationships?: Record<string, { id: string; name: string; type: string }[]>;
  [key: string]: unknown;
}

export interface CatalogVersionRecord {
  entity_type: string;
  entity_id: string;
  version_no: number;
  operation: 'create' | 'update';
  actor: string;
  changed_at: string;
  snapshot: Record<string, unknown>;
  changed_fields: Record<string, { from: unknown; to: unknown }>;
}

export interface CatalogVersionDiff {
  entity_type: string;
  entity_id: string;
  from_version: number;
  to_version: number;
  changed_fields: Record<string, { from: unknown; to: unknown }>;
}

export interface CatalogRelationshipMeta {
  key: string;
  target_type: CatalogEntityType;
  kind: 'fk_out' | 'fk_in' | 'junction';
}

export interface CatalogFieldMeta {
  name: string;
  type: string;          // string | number | integer | boolean | array | object
  required: boolean;
}

export interface CatalogEntityMeta {
  label: string;
  id_prefix: string;
  search_fields: string[];
  filter_fields: string[];
  required_fields: string[];
  fields: CatalogFieldMeta[];
  relationships: CatalogRelationshipMeta[];
  // Seed-derived vocabulary for free-text fields (complexity, risk_tier, ...).
  suggested_values: Record<string, string[]>;
}

export interface CatalogRegistry {
  dependency_order: CatalogEntityType[];
  types: Record<CatalogEntityType, CatalogEntityMeta>;
}

// Catalog lifecycle mode: examples (shipped seed loaded), scratch (deliberately
// emptied), custom (user-tailored via selective import and/or edits).
export type CatalogMode = 'examples' | 'scratch' | 'custom';

export interface CatalogProvenanceCount {
  total: number;
  examples: number;
  user: number;
}

export interface CatalogSeedStatus {
  mode: CatalogMode;
  seed_applied: boolean;
  totals: CatalogProvenanceCount;
  by_type: Record<string, CatalogProvenanceCount>;
}

export interface CatalogLibraryItem {
  source_ref: string | null;
  name: string | null;
  description?: string | null;
  imported: boolean;
  attrs: Record<string, unknown>;
}

export type CatalogLibrary = Record<string, CatalogLibraryItem[]>;

export interface CatalogImportReport {
  entities: Record<string, number>;
  relationships: Record<string, number>;
  skipped: Record<string, number>;
  total_entities: number;
  total_relationships: number;
  unresolved_relationships: number;
  dry_run: boolean;
  mode?: string | null;
}

export interface CatalogDocument {
  entities: Record<string, Record<string, unknown>[]>;
  relationships: Record<string, Record<string, unknown>[]>;
}

export type CatalogLifecycleMode =
  | 'reset-to-examples'
  | 'start-from-scratch'
  | 'clear-examples'
  | 'clear-user';

export interface CatalogLifecycleResult {
  cleared: Record<string, number>;
  imported: CatalogImportReport | null;
  mode: CatalogMode;
  seed_applied: boolean;
}

export interface CatalogDeleteResult {
  deleted: string[];
  counts: Record<string, number>;
}

export interface CatalogListParams {
  q?: string;
  limit?: number;
  offset?: number;
  related_key?: string;
  related_id?: string;
  [filterField: string]: string | number | undefined;
}

// Relationship graph (scoped node/edge projection) --------------------------

export interface CatalogGraphNode {
  id: string;
  entity_type: CatalogEntityType;
  name: string;
  status?: string | null;
  version_no: number;
  attrs: Record<string, unknown>;
}

export interface CatalogGraphEdge {
  id: string;
  source: string;
  target: string;
  rel_kind: 'fk' | 'junction';
  rel_key: string;
}

export interface CatalogGraphScope {
  type: 'segment' | 'domain';
  id: string;
  name: string;
}

export interface CatalogGraph {
  scope: CatalogGraphScope;
  nodes: CatalogGraphNode[];
  edges: CatalogGraphEdge[];
  included: string[];
  node_count: number;
  edge_count: number;
  truncated: boolean;
}

export interface CatalogGraphParams {
  scope_type: 'segment' | 'domain';
  scope_id: string;
  // Comma-separated optional types: kpis, data-assets, technology-components
  include?: string;
  // Comma-separated node ids whose 1-hop neighbors should be pulled in
  expand?: string;
}

export const catalogApi = {
  registry: async (): Promise<CatalogRegistry> => {
    const response = await client.get<CatalogRegistry>('/api/v1/catalog/registry');
    return response.data;
  },
  seedStatus: async (): Promise<CatalogSeedStatus> => {
    const response = await client.get<CatalogSeedStatus>('/api/v1/catalog/seed/status');
    return response.data;
  },
  list: async (type: CatalogEntityType, params: CatalogListParams = {}): Promise<CatalogEntity[]> => {
    const response = await client.get<CatalogEntity[]>(`/api/v1/catalog/${type}`, { params });
    return response.data;
  },
  get: async (type: CatalogEntityType, id: string, withRelationships = false): Promise<CatalogEntity> => {
    const response = await client.get<CatalogEntity>(`/api/v1/catalog/${type}/${id}`, {
      params: withRelationships ? { with_relationships: true } : {},
    });
    return response.data;
  },
  create: async (type: CatalogEntityType, data: Record<string, unknown>): Promise<CatalogEntity> => {
    const response = await client.post<CatalogEntity>(`/api/v1/catalog/${type}`, data);
    return response.data;
  },
  update: async (type: CatalogEntityType, id: string, data: Record<string, unknown>): Promise<CatalogEntity> => {
    const response = await client.put<CatalogEntity>(`/api/v1/catalog/${type}/${id}`, data);
    return response.data;
  },
  versions: async (type: CatalogEntityType, id: string): Promise<CatalogVersionRecord[]> => {
    const response = await client.get<CatalogVersionRecord[]>(`/api/v1/catalog/${type}/${id}/versions`);
    return response.data;
  },
  version: async (type: CatalogEntityType, id: string, versionNo: number): Promise<CatalogVersionRecord> => {
    const response = await client.get<CatalogVersionRecord>(`/api/v1/catalog/${type}/${id}/versions/${versionNo}`);
    return response.data;
  },
  diff: async (type: CatalogEntityType, id: string, from: number, to: number): Promise<CatalogVersionDiff> => {
    const response = await client.get<CatalogVersionDiff>(
      `/api/v1/catalog/${type}/${id}/versions/diff`, { params: { from, to } }
    );
    return response.data;
  },
  searchVersions: async (params: {
    type?: string; actor?: string; from?: string; to?: string; field?: string;
  }): Promise<CatalogVersionRecord[]> => {
    const response = await client.get<CatalogVersionRecord[]>('/api/v1/catalog/versions/search', { params });
    return response.data;
  },
  graph: async (params: CatalogGraphParams): Promise<CatalogGraph> => {
    const response = await client.get<CatalogGraph>('/api/v1/catalog/graph', { params });
    return response.data;
  },
  remove: async (type: CatalogEntityType, id: string, cascade = false): Promise<CatalogDeleteResult> => {
    const response = await client.delete<CatalogDeleteResult>(
      `/api/v1/catalog/${type}/${id}`, { params: cascade ? { cascade: true } : {} },
    );
    return response.data;
  },
  seedLibrary: async (): Promise<CatalogLibrary> => {
    const response = await client.get<CatalogLibrary>('/api/v1/catalog/seed/library');
    return response.data;
  },
  // Import shipped examples. Omit source_refs for the full seed; supply a subset
  // (with include_dependencies) for selective reuse.
  importSeed: async (body: {
    source_refs?: string[]; include_dependencies?: boolean; dry_run?: boolean;
  } = {}): Promise<CatalogImportReport> => {
    const response = await client.post<CatalogImportReport>('/api/v1/catalog/seed/import', body);
    return response.data;
  },
  // Import an arbitrary catalog document (entities + relationships by local refs).
  importDocument: async (
    doc: CatalogDocument & { as_examples?: boolean; dry_run?: boolean },
  ): Promise<CatalogImportReport> => {
    const response = await client.post<CatalogImportReport>('/api/v1/catalog/import', doc);
    return response.data;
  },
  exportCatalog: async (scope: 'all' | 'user' | 'examples' = 'all'): Promise<CatalogDocument> => {
    const response = await client.get<CatalogDocument>('/api/v1/catalog/export', { params: { scope } });
    return response.data;
  },
  lifecycle: async (mode: CatalogLifecycleMode): Promise<CatalogLifecycleResult> => {
    const response = await client.post<CatalogLifecycleResult>('/api/v1/catalog/lifecycle', { mode });
    return response.data;
  },
};
