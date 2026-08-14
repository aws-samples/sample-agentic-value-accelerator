import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const PREFIX = '/api/v1/mcp';

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

export interface McpServer {
  server_id: string;
  name: string;
  url: string;
  description: string;
  category: string;
  auth_hint: string;
  delegation_mode: string;
  source: string;
  curated_id?: string;
  header_name?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CuratedMcpServer {
  id: string;
  name: string;
  publisher: string;
  category: string;
  posture: string;
  url: string;
  auth_hint: string;
  delegation_mode: string;
  description: string;
  docs_url: string;
}

export interface McpServerCreate {
  name: string;
  url: string;
  description?: string;
  category?: string;
  auth_hint?: string;
  delegation_mode?: string;
  header_name?: string;
  header_value?: string;
  source?: string;
  curated_id?: string;
}

export const mcpApi = {
  list: () => req<{ servers: McpServer[]; warning?: string }>('get', '/list'),
  curated: () => req<{ servers: CuratedMcpServer[]; warning?: string; $comment?: string }>('get', '/curated'),
  register: (r: McpServerCreate) => req<McpServer>('post', '', r),
  remove: (id: string) => req<void>('delete', `/${id}`),
};
