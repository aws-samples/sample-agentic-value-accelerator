// Thin wrappers for the /harness backend routes.
// IMPORTANT: We MUST route through the shared axios client so the Cognito
// JWT + dev-user-email headers get attached by the request interceptor.
// Using raw fetch() here bypassed the interceptor and returned 401.
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const PREFIX = '/api/v1/harness';

const httpClient = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

httpClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const devUserEmail = localStorage.getItem('dev_user_email');
  if (devUserEmail) config.headers['x-user-email'] = devUserEmail;
  return config;
});

async function json<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || 'GET').toUpperCase();
  const body = init?.body ? JSON.parse(init.body as string) : undefined;
  try {
    const resp = await httpClient.request<T>({
      url: `${PREFIX}${path}`,
      method,
      data: body,
    });
    return resp.data;
  } catch (e) {
    // Axios error shape
    const err = e as { response?: { status?: number; data?: unknown }; message?: string };
    const status = err.response?.status;
    const detail = (err.response?.data as { detail?: string })?.detail || err.message || 'Request failed';
    throw new Error(`${status ?? '?'}: ${detail}`);
  }
}

// SSE streaming needs raw fetch (axios can't stream), so export a helper that
// injects the same auth header used above.
export function harnessAuthHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('auth_token');
  if (token) h.Authorization = `Bearer ${token}`;
  const devUserEmail = localStorage.getItem('dev_user_email');
  if (devUserEmail) h['x-user-email'] = devUserEmail;
  return h;
}

export interface FoundationModel {
  modelId: string;
  modelName: string;
  providerName: string;
  inputModalities: string[];
  outputModalities: string[];
}

export interface HarnessSummary {
  harness_id: string;
  harness_arn: string;
  harness_name: string;
  status: string;
  model_id?: string;
  tools: string[];
  version?: string;
  updated_at?: string;
  created_at?: string;
}

export interface ToolConfig {
  type: 'agentcore_browser' | 'agentcore_code_interpreter' | 'remote_mcp' | 'agentcore_gateway';
  name: string;
  url?: string;
  header_name?: string;
  header_value?: string;
  gateway_arn?: string;
}

export interface MemoryConfig {
  mode: 'managed' | 'disabled' | 'byo';
  strategies?: string[];
  event_expiry_duration?: number;
  byo_memory_arn?: string;
}

export interface GuardrailConfig {
  guardrail_id: string;
  guardrail_version: string;
}

export interface HarnessCreateRequest {
  harness_name: string;
  execution_role_arn: string;
  system_prompt?: string;
  model_id?: string;
  api_format?: string;
  tools?: ToolConfig[];
  memory?: MemoryConfig;
  guardrail?: GuardrailConfig;
  max_iterations?: number;
  timeout_seconds?: number;
  max_tokens?: number;
  tags?: Record<string, string>;
}

export interface HarnessDefaults {
  execution_role_arn: string;
  aws_region: string;
}

export const harnessApi = {
  defaults: () => json<HarnessDefaults>('/defaults'),
  listModels: () => json<{ models: FoundationModel[] }>('/foundation-models'),
  list: () => json<{ harnesses: HarnessSummary[]; warning?: string }>('/list'),
  get: (id: string) => json<Record<string, unknown>>(`/${id}`),
  create: (req: HarnessCreateRequest) =>
    json<Record<string, unknown>>('', { method: 'POST', body: JSON.stringify(req) }),
  update: (id: string, req: Partial<HarnessCreateRequest>) =>
    json<Record<string, unknown>>(`/${id}`, { method: 'PATCH', body: JSON.stringify(req) }),
  remove: (id: string) => json<void>(`/${id}`, { method: 'DELETE' }),
  versions: (id: string) => json<{ versions: unknown[] }>(`/${id}/versions`),
  endpoints: (id: string) => json<{ endpoints: unknown[] }>(`/${id}/endpoints`),
  updateEndpoint: (id: string, name: string, targetVersion: string) =>
    json<Record<string, unknown>>(`/${id}/endpoints/${name}`, {
      method: 'PATCH',
      body: JSON.stringify({ target_version: targetVersion }),
    }),
  // invoke uses SSE via fetch reader; consumers call this directly and parse events
  invokeUrl: () => `${API_BASE}${PREFIX}/invoke`,
};

// UUIDv4 generator for runtimeSessionId (min 33 chars per API contract — a v4
// UUID is 36 chars). No dependency on the browser crypto API's randomUUID so
// the code still works on http://localhost during dev.
export function generateSessionId(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
