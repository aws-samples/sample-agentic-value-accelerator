import axios, { AxiosError } from 'axios';
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
} from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const client = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token and user email
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // For dev mode: send x-user-email header to simulate different users
  const devUserEmail = localStorage.getItem('dev_user_email');
  if (devUserEmail) {
    config.headers['x-user-email'] = devUserEmail;
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
      localStorage.removeItem('auth_token');
      window.location.reload();
      return Promise.reject(new Error('Session expired. Please log in again.'));
    }
    const errorMessage = error.response?.data?.detail || error.message;
    return Promise.reject(new Error(errorMessage));
  }
);

// Projects API
export const projectsApi = {
  generate: async (data: ProjectCreate): Promise<ProjectResponse> => {
    const response = await client.post<ProjectResponse>('/api/v1/projects/generate', data);
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
    const response = await client.get<LangfuseServer[]>('/api/v1/langfuse-servers');
    return response.data;
  },

  create: async (data: LangfuseServerCreate): Promise<LangfuseServer> => {
    const response = await client.post<LangfuseServer>('/api/v1/langfuse-servers', data);
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
    const response = await client.get('/health');
    return response.data;
  },

  ping: async () => {
    const response = await client.get('/ping');
    return response.data;
  },
};

// Template Catalog API
export const getTemplates = async (
  patternType?: string,
  framework?: string,
  deploymentPattern?: string
): Promise<Template[]> => {
  const params = new URLSearchParams();
  if (patternType) params.append('pattern_type', patternType);
  if (framework) params.append('framework', framework);
  if (deploymentPattern) params.append('deployment_pattern', deploymentPattern);

  const response = await client.get<{ templates: Template[]; total: number }>('/api/v1/templates', { params });
  return response.data.templates; // Extract templates array from response
};

export const getTemplate = async (templateId: string): Promise<Template> => {
  const response = await client.get<{ metadata: Template; path: string }>(`/api/v1/templates/${templateId}`);
  return response.data.metadata; // Extract metadata from response
};

export const getTemplateStats = async (): Promise<TemplateStats> => {
  const response = await client.get<{
    total_templates: number;
    pattern_types: Record<string, number>;
    frameworks: string[];
    deployment_patterns: string[];
  }>('/api/v1/templates/stats');

  // Convert pattern_types object to array of keys
  return {
    total_templates: response.data.total_templates,
    pattern_types: Object.keys(response.data.pattern_types),
    frameworks: response.data.frameworks,
    deployment_patterns: response.data.deployment_patterns
  };
};

export const bootstrapProject = async (request: BootstrapRequest): Promise<Blob> => {
  const response = await client.post('/api/v1/bootstrap', request, {
    responseType: 'blob',
  });
  return response.data;
};

// Deployments API
export const deploymentsApi = {
  list: async (status?: string, templateId?: string): Promise<Deployment[]> => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (templateId) params.append('template_id', templateId);
    const response = await client.get<Deployment[]>('/api/v1/deployments', { params });
    return response.data;
  },

  get: async (id: string): Promise<Deployment> => {
    const response = await client.get<Deployment>(`/api/v1/deployments/${id}`);
    return response.data;
  },

  create: async (data: DeploymentCreate): Promise<Deployment> => {
    const response = await client.post<Deployment>('/api/v1/deployments', data);
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

  getTemplateDependencies: async (templateId: string): Promise<{ template_id: string; name: string; has_active_deployment: boolean; outputs: Record<string, string> }[]> => {
    const response = await client.get(`/api/v1/deployments/templates/${templateId}/dependencies`);
    return response.data;
  },

  redeployDeployment: async (id: string): Promise<Deployment> => {
    const response = await client.post<Deployment>(`/api/v1/deployments/${id}/redeploy`);
    return response.data;
  },

  getDeploymentLogs: async (id: string): Promise<{ deployment_id: string; build_id: string; logs: string }> => {
    const response = await client.get<{ deployment_id: string; build_id: string; logs: string }>(`/api/v1/deployments/${id}/logs`);
    return response.data;
  },

  getSourceZipUrl: async (id: string): Promise<{ download_url: string; s3_bucket: string; s3_key: string }> => {
    const response = await client.get<{ download_url: string; s3_bucket: string; s3_key: string }>(`/api/v1/deployments/${id}/source-zip`);
    return response.data;
  },

  testDeployment: async (deploymentId: string, payload: Record<string, any>): Promise<TestStartResponse> => {
    const response = await client.post<TestStartResponse>(`/api/v1/deployments/${deploymentId}/test`, { payload });
    return response.data;
  },

  getTestResult: async (deploymentId: string, testId: string): Promise<TestDeploymentResponse> => {
    const response = await client.get<TestDeploymentResponse>(`/api/v1/deployments/${deploymentId}/test/${testId}`);
    return response.data;
  },

  uploadTestData: async (deploymentId: string, file: File): Promise<{ s3_key: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await client.post<{ s3_key: string }>(
      `/api/v1/deployments/${deploymentId}/upload-test-data`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },

  runTestScript: async (deploymentId: string, scriptType: string): Promise<any> => {
    const response = await client.post(
      `/api/v1/deployments/${deploymentId}/run-script`,
      { script_type: scriptType }
    );
    return response.data;
  },

  getSampleData: async (deploymentId: string): Promise<any> => {
    const response = await client.get(`/api/v1/deployments/${deploymentId}/sample-data`);
    return response.data;
  },
};

// User API
export const userApi = {
  getCurrentUser: async (): Promise<{ email: string; role: string; role_level: number; can_deploy: boolean }> => {
    const response = await client.get('/api/v1/users/me');
    return response.data;
  },
};

export default client;

// App Factory API
export const appFactoryApi = {
  submit: async (data: Record<string, string>): Promise<{ submission_id: string }> => {
    const response = await client.post<{ submission_id: string }>('/api/v1/app-factory/submissions', data);
    return response.data;
  },

  deploy: async (submissionId: string): Promise<Deployment> => {
    const response = await client.post<Deployment>(`/api/v1/app-factory/submissions/${submissionId}/deploy`);
    return response.data;
  },

  get: async (submissionId: string): Promise<Record<string, any>> => {
    const response = await client.get<Record<string, any>>(`/api/v1/app-factory/submissions/${submissionId}`);
    return response.data;
  },

  list: async (): Promise<Record<string, any>[]> => {
    const response = await client.get<Record<string, any>[]>('/api/v1/app-factory/submissions');
    return response.data;
  },
};

// Applications API (FSI Foundry)
export const applicationsApi = {
  listFoundryUseCases: async () => {
    const response = await client.get('/api/v1/applications/foundry/use-cases');
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
    const response = await client.post<Deployment>('/api/v1/applications/foundry/deploy', data);
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
    const response = await client.post<Deployment>('/api/v1/applications/foundry/deploy-from-git', data);
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
    const response = await client.get<FrontierAgentCatalogEntry[]>('/api/v1/frontier-agents/catalog');
    return response.data;
  },

  getAgent: async (agentId: string): Promise<FrontierAgentCatalogEntry> => {
    const response = await client.get<FrontierAgentCatalogEntry>(`/api/v1/frontier-agents/catalog/${agentId}`);
    return response.data;
  },

  deploy: async (data: {
    deployment_name: string;
    agent_id: string;
    iac_type: string;
    aws_region: string;
    parameters?: Record<string, any>;
  }): Promise<Deployment> => {
    const response = await client.post<Deployment>('/api/v1/frontier-agents/deploy', data);
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
    const response = await client.get<CodeCommitRepo[]>('/api/v1/codecommit/repositories');
    return response.data;
  },
};
