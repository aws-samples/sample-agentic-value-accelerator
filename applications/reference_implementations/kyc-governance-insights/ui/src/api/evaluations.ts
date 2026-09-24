import { cfgEnv } from '../runtimeConfig';
import { notConfigured, httpFailure, errorFailure, clearLiveFailure } from './liveStatus';
const EVAL_API = cfgEnv('registry_api_url', import.meta.env.VITE_REGISTRY_API_URL);
// Reads (agents/evaluators) use the display endpoint above. WRITES (record-evaluation)
// go to our own account's registry proxy where the write path is fixed and the data
// (genuinely computed evaluation runs) actually persists. Falls back to EVAL_API.
const EVAL_WRITE_API = cfgEnv('eval_write_api_url', import.meta.env.VITE_EVAL_WRITE_API_URL) || EVAL_API;
const API_KEY = cfgEnv('api_key', import.meta.env.VITE_API_KEY);
const TENANT_ID = cfgEnv('tenant_id', import.meta.env.VITE_TENANT_ID) || 'default';

export interface EvaluatorDef {
  evaluator_id: string;
  name: string;
  category: string;
  gateType: 'hard' | 'soft';
  currentScore: number;
  threshold: number;
  status: 'passing' | 'failing' | 'degraded';
}

export interface EvalResultRecord {
  evaluator_id: string;
  timestamp: string;
  score: number;
  passed: boolean;
  details: string;
}

export async function fetchEvaluators(): Promise<EvaluatorDef[] | null> {
  if (!EVAL_API) return null;
  const res = await fetch(`${EVAL_API}/evaluators`, { signal: AbortSignal.timeout(5000), headers: { ...(API_KEY ? { 'x-api-key': API_KEY } : {}), 'x-tenant-id': TENANT_ID } });
  if (!res.ok) return null;
  const data = await res.json();
  // The registry proxy returns { evaluators: [...] }; tolerate a bare array too.
  // Return null (not an empty array) when unseeded so callers can show a
  // "run the seed script" state instead of silently rendering nothing/fake data.
  const list = Array.isArray(data) ? data : (data?.evaluators ?? null);
  return Array.isArray(list) && list.length > 0 ? (list as EvaluatorDef[]) : null;
}

export async function fetchEvalResults(evaluatorId: string): Promise<EvalResultRecord[] | null> {
  if (!EVAL_API) return null;
  const res = await fetch(`${EVAL_API}/results?evaluator_id=${evaluatorId}`, { signal: AbortSignal.timeout(5000), headers: { ...(API_KEY ? { 'x-api-key': API_KEY } : {}), 'x-tenant-id': TENANT_ID } });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchAgentRegistry(): Promise<any[] | null> {
  if (!EVAL_API) return null;
  const res = await fetch(`${EVAL_API}/agents`, { signal: AbortSignal.timeout(5000), headers: { ...(API_KEY ? { 'x-api-key': API_KEY } : {}), 'x-tenant-id': TENANT_ID } });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchEvaluationHistory(): Promise<any[] | null> {
  if (!EVAL_API) return null;
  const headers: Record<string, string> = { 'x-tenant-id': TENANT_ID };
  if (API_KEY) headers['x-api-key'] = API_KEY;
  const res = await fetch(`${EVAL_API}/evaluations`, { signal: AbortSignal.timeout(5000), headers: Object.keys(headers).length ? headers : undefined });
  if (!res.ok) return null;
  const data = await res.json();
  return data.evaluations || data;
}

export interface EvalWritePayload {
  scenario: string;
  verdict: string;
  confidence: number;
  duration_ms: number;
  checks_passed: string[];
  checks_failed: string[];
  grounding_score: number;
  ar_verdict: string;
  model_id: string;
  agent_id: string;
}

export async function recordEvaluation(payload: EvalWritePayload): Promise<boolean> {
  if (!EVAL_WRITE_API) {
    notConfigured('evaluations', 'eval_write_api_url');
    return false;
  }
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-tenant-id': TENANT_ID };
    if (API_KEY) headers['x-api-key'] = API_KEY;
    const res = await fetch(`${EVAL_WRITE_API}/record-evaluation`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      httpFailure('evaluations', res, await res.text().catch(() => ''));
      return false;
    }
    clearLiveFailure('evaluations');
    return true;
  } catch (err) {
    errorFailure('evaluations', err);
    return false;
  }
}
