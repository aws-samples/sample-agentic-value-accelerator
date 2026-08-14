// Registry Skills API client — /api/v1/skills routes to AWS Agent
// Registry with recordType=SKILL.
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const PREFIX = '/api/v1/skills';

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

export interface RegisteredSkill {
  skill_id: string;
  record_arn: string;
  name: string;
  kind: string;
  description: string;
  input_variables: string[];
  output_schema?: unknown;
  tags: string[];
  posture: string;
  source: string;
  curated_id?: string;
  status: string;
  status_raw?: string;
  created_at: string;
  updated_at: string;
}

export interface CuratedSkill {
  id: string;
  name: string;
  posture: 'official' | 'community' | string;
  kind: string;
  description: string;
  input_variables?: string[];
  output_schema?: unknown;
  tags?: string[];
  source?: string;
}

export interface SkillCreate {
  name: string;
  kind?: string;
  description?: string;
  input_variables?: string[];
  output_schema?: unknown;
  tags?: string[];
  posture?: string;
  source?: string;
  curated_id?: string;
}

export const skillsApi = {
  list:     () => req<{ skills: RegisteredSkill[]; warning?: string }>('get', '/list'),
  curated:  () => req<{ note?: string; skills: CuratedSkill[]; warning?: string }>('get', '/curated'),
  get:      (id: string) => req<RegisteredSkill>('get', `/${id}`),
  register: (r: SkillCreate) => req<RegisteredSkill>('post', '', r),
  remove:   (id: string) => req<void>('delete', `/${id}`),
};
