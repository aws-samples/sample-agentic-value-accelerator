// Custom Resources API client — /api/v1/custom-resources routes to AWS
// Agent Registry with recordType=CUSTOM.
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const PREFIX = '/api/v1/custom-resources';

const httpClient = axios.create({ baseURL: API_BASE, headers: { 'Content-Type': 'application/json' } });
httpClient.interceptors.request.use((c) => {
  const t = localStorage.getItem('auth_token'); if (t) c.headers.Authorization = `Bearer ${t}`;
  const e = localStorage.getItem('dev_user_email'); if (e) c.headers['x-user-email'] = e;
  return c;
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

export interface CustomResource {
  resource_id: string;
  record_arn: string;
  name: string;
  kind: string;
  description: string;
  tags: string[];
  metadata: Record<string, unknown>;
  record_tags: Record<string, string>;
  status: string;
  status_raw?: string;
  created_at: string;
  updated_at: string;
}

export interface CustomResourceCreate {
  name: string;
  kind?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export const customResourcesApi = {
  list:     () => req<{ resources: CustomResource[]; warning?: string }>('get', '/list'),
  get:      (id: string) => req<CustomResource>('get', `/${id}`),
  register: (r: CustomResourceCreate) => req<CustomResource>('post', '', r),
  remove:   (id: string) => req<void>('delete', `/${id}`),
};
