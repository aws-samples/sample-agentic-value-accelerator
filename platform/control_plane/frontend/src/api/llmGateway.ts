import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_BASE = `${API_URL}/api/v1/llm-gateway`;

const client = axios.create({ baseURL: API_BASE, headers: { 'Content-Type': 'application/json' } });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const devUserEmail = localStorage.getItem('dev_user_email');
  if (devUserEmail) config.headers['x-user-email'] = devUserEmail;
  return config;
});

export interface GatewayInstance {
  id: string;
  name: string;
  endpoint: string;
  admin_ui_url: string;
  status: string;
  region: string;
  environment: string;
  enabled_models: string[];
  attached_guardrail_id?: string | null;
  langfuse_attached: boolean;
  deployed_at?: string | null;
  config_parameter_name?: string | null;
  cluster_name?: string | null;
  service_name?: string | null;
  audit_log_group?: string | null;
}

export interface DeployRequest {
  project_name: string;
  aws_region?: string;
  environment?: string;
  master_key: string;
  enabled_models?: string[];
  attach_guardrail_id?: string;
  attach_guardrail_version?: string;
  langfuse_host?: string;
  existing_vpc_id?: string;
  cognito_user_pool_id?: string;
  litellm_version?: string;
}

export interface VirtualKeyCreate {
  name: string;
  team_id?: string;
  models?: string[];
  max_budget?: number;
  budget_duration?: string;
  tpm_limit?: number;
  rpm_limit?: number;
  metadata?: Record<string, unknown>;
}

export interface SpendBucket {
  api_key?: string;
  key_alias?: string;
  model?: string;
  spend: number;
}

export interface SpendReport {
  days: number;
  total_usd: number;
  by_key: SpendBucket[];
  by_model: SpendBucket[];
}

export interface AuditRow {
  request_id: string;
  timestamp: string;
  model: string;
  api_key: string;
  key_alias: string;
  status: string;
  tokens: { prompt: number; completion: number; total: number };
  spend_usd: number;
  end_user: string;
  team_id: string;
  cache_hit: boolean;
  duration_ms?: number;
  // CloudWatch rows come as flat key-value
  '@timestamp'?: string;
  '@message'?: string;
}

export interface AuditResponse {
  source: 'cloudwatch' | 'litellm_api' | 'none';
  log_group: string | null;
  rows: AuditRow[];
}

export const llmGatewayApi = {
  health: async () => (await client.get('/health')).data as { deployed: boolean; status: string; endpoint?: string },
  listInstances: async () => (await client.get<GatewayInstance[]>('/instances')).data,
  getInstance: async (id: string) => (await client.get<GatewayInstance>(`/instances/${id}`)).data,
  deploy: async (req: DeployRequest) => (await client.post('/deploy', req)).data,
  getConfig: async (id: string) =>
    (await client.get<{ config_yaml: string; version: number }>(`/${id}/config`)).data,
  updateConfig: async (id: string, configYaml: string) =>
    (await client.put(`/${id}/config`, { config_yaml: configYaml })).data,
  listModels: async (id: string) => (await client.get(`/${id}/models`)).data as Array<{ id: string }>,
  listVirtualKeys: async (id: string) => (await client.get(`/${id}/virtual-keys`)).data as Array<Record<string, unknown>>,
  createVirtualKey: async (id: string, req: VirtualKeyCreate) =>
    (await client.post(`/${id}/virtual-keys`, req)).data,
  getSpend: async (id: string, days = 30) => (await client.get<SpendReport>(`/${id}/spend`, { params: { days } })).data,
  getAudit: async (id: string, hours = 24, limit = 100) =>
    (await client.get(`/${id}/audit`, { params: { hours, limit } })).data as AuditResponse,
  playground: async (id: string, req: { model: string; messages: Array<{ role: string; content: string }>; max_tokens?: number; virtual_key?: string }) =>
    (await client.post(`/${id}/playground`, req)).data,
};
