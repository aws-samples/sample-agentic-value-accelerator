import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const PREFIX = '/api/v1/a2a';

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

export interface A2aAgent {
  agent_id: string;
  name: string;
  endpoint: string;
  description: string;
  category: string;
  auth_hint: string;
  delegation_mode: string;
  source: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CuratedA2aAgent {
  id: string;
  name: string;
  publisher: string;
  category: string;
  posture: string;
  agent_card_url: string;
  auth_hint: string;
  delegation_mode: string;
  description: string;
  docs_url: string;
}

export interface A2aAgentCreate {
  name: string;
  endpoint: string;
  description?: string;
  category?: string;
  auth_hint?: string;
  delegation_mode?: string;
  source?: string;
  curated_id?: string;
}

export const a2aApi = {
  list: () => req<{ agents: A2aAgent[]; warning?: string }>('get', '/list'),
  curated: () => req<{ agents: CuratedA2aAgent[]; warning?: string; $comment?: string }>('get', '/curated'),
  fetchCard: (endpoint: string) => req<{ agent_card: Record<string, unknown>; resolved_url: string }>('post', '/fetch-card', { endpoint }),
  register: (r: A2aAgentCreate) => req<A2aAgent>('post', '', r),
  remove: (id: string) => req<void>('delete', `/${id}`),
};
