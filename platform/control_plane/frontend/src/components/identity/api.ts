import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const PREFIX = '/api/v1/identity-providers';

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

export interface IdentityProvider {
  provider_id: string;
  name: string;
  provider_type: string;
  discovery_url: string;
  client_id: string;
  is_confidential: boolean;
  group_claim: string;
  claim_mappings: Record<string, string>;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ProviderTypeDef {
  id: string;
  label: string;
  hint: string;
  group_claim: string;
}

export interface ProviderReference {
  provider_types: ProviderTypeDef[];
  ava_roles: string[];
}

export interface ProviderCreate {
  name: string;
  provider_type: string;
  discovery_url: string;
  client_id: string;
  client_secret?: string;
  is_confidential?: boolean;
  group_claim?: string;
  claim_mappings?: Record<string, string>;
  description?: string;
}

export type ProviderUpdate = Partial<Omit<ProviderCreate, 'provider_type'>>;

export interface SystemProvider extends IdentityProvider {
  source: 'system';
  region?: string;
  pool_id?: string;
  hosted_ui_domain?: string;
  mfa_configuration?: string;
  estimated_users?: number | null;
  groups?: string[];
}

export const identityApi = {
  reference: () => req<ProviderReference>('get', '/reference'),
  list: () => req<{ providers: IdentityProvider[]; warning?: string }>('get', '/list'),
  system: () => req<SystemProvider>('get', '/system'),
  testDiscovery: (discovery_url: string) => req<{ ok: boolean; discovery: Record<string, unknown>; resolved_url: string }>('post', '/test-discovery', { discovery_url }),
  register: (r: ProviderCreate) => req<IdentityProvider>('post', '', r),
  update: (id: string, r: ProviderUpdate) => req<IdentityProvider>('patch', `/${id}`, r),
  remove: (id: string) => req<void>('delete', `/${id}`),
};
