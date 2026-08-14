// Thin API client for /memory routes. Local axios instance mirrors the
// Cognito JWT + dev-user-email interceptor from src/api/client.ts so requests
// don't get 401'd. See harness/api.ts for the same pattern.
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const PREFIX = '/api/v1/memory';

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

async function req<T>(method: 'get' | 'post' | 'patch' | 'delete', path: string, body?: unknown): Promise<T> {
  try {
    const r = await httpClient.request<T>({ url: `${PREFIX}${path}`, method, data: body });
    return r.data;
  } catch (e) {
    const err = e as { response?: { status?: number; data?: unknown }; message?: string };
    const detail = (err.response?.data as { detail?: string })?.detail || err.message || 'Request failed';
    throw new Error(`${err.response?.status ?? '?'}: ${detail}`);
  }
}

export interface MemorySummary {
  memory_id: string;
  memory_arn: string;
  name: string;
  description: string;
  status: string;
  strategies: string[];
  event_expiry_duration: number;
  created_at: string;
  updated_at: string;
}

export interface StrategyDef {
  id: string;
  label: string;
  description: string;
}

export interface MemoryCreateRequest {
  name: string;
  description?: string;
  event_expiry_duration?: number;
  strategies?: string[];
}

export const memoryApi = {
  strategies: () => req<{ strategies: StrategyDef[] }>('get', '/strategies'),
  list: () => req<{ memories: MemorySummary[]; warning?: string }>('get', '/list'),
  get: (id: string) => req<MemorySummary>('get', `/${id}`),
  create: (r: MemoryCreateRequest) => req<MemorySummary>('post', '', r),
  update: (id: string, r: Partial<MemoryCreateRequest>) => req<MemorySummary>('patch', `/${id}`, r),
  remove: (id: string) => req<void>('delete', `/${id}`),
};
