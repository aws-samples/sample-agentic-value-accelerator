// Registry Agents API client — mirrors the shape of mcp/api.ts and
// a2a/api.ts. All calls target /api/v1/agents (backed by AWS Agent
// Registry recordType=AGENT, tag Kind=agent to distinguish from A2A
// Servers which use Kind=a2a).
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const PREFIX = '/api/v1/agents';

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

export interface RegisteredAgent {
  agent_id: string;
  record_arn: string;
  name: string;
  runtime: string;
  runtime_ref: string;
  description: string;
  capabilities: string[];
  auth_hint: string;
  category: string;
  source: string;
  curated_id?: string;
  status: string;
  status_raw?: string;
  created_at: string;
  updated_at: string;
}

export interface CuratedAgent {
  id: string;
  name: string;
  publisher: string;
  category: string;
  posture: 'official' | 'community' | string;
  runtime: string;
  runtime_ref: string;
  description: string;
  capabilities?: string[];
  auth_hint?: string;
  docs_url?: string;
}

export interface AgentCreate {
  name: string;
  runtime?: string;
  runtime_ref: string;
  description?: string;
  capabilities?: string[];
  auth_hint?: string;
  category?: string;
  source?: string;
  curated_id?: string;
}

export const agentsApi = {
  list:     () => req<{ agents: RegisteredAgent[]; warning?: string }>('get', '/list'),
  curated:  () => req<{ agents: CuratedAgent[]; warning?: string }>('get', '/curated'),
  get:      (id: string) => req<RegisteredAgent>('get', `/${id}`),
  register: (r: AgentCreate) => req<RegisteredAgent>('post', '', r),
  remove:   (id: string) => req<void>('delete', `/${id}`),
};
