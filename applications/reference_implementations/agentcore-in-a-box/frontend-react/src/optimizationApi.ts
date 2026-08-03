/**
 * Frontend client for AgentCore Optimization (recommendations + configuration bundles + A/B).
 *
 * All calls hit the ops-plane Lambda on the shared API Gateway with the Cognito ID token.
 * recommend + experiment are admin-only (enforced server-side on cognito:groups); read is open.
 */
import type { Auth, AppConfig } from './auth';

export interface OptState {
  configured: boolean;
  experiment: {
    active: boolean;
    flag: string;
    control_bundle_id: string;
    treatment_bundle_id: string;
  };
  governance_evaluator?: string;
  recommendations?: Array<{ recommendation_id: string; name: string; type: string; status: string }>;
  recommendations_error?: string;
  note?: string;
}

async function authedFetch(auth: Auth, cfg: AppConfig, path: string, init?: RequestInit): Promise<any> {
  const resp = await fetch(`${cfg.API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.getIdToken()}`,
      ...(init?.headers || {}),
    },
  });
  const text = await resp.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text }; }
  if (!resp.ok) throw new Error(body?.error || `${resp.status} ${resp.statusText}`);
  return body;
}

export const optimizationApi = {
  state: (auth: Auth, cfg: AppConfig): Promise<OptState> => authedFetch(auth, cfg, '/optimization'),
  recommend: (auth: Auth, cfg: AppConfig): Promise<any> =>
    authedFetch(auth, cfg, '/optimization/recommend', { method: 'POST', body: '{}' }),
  experiment: (auth: Auth, cfg: AppConfig, action: 'start' | 'stop'): Promise<any> =>
    authedFetch(auth, cfg, '/optimization/experiment', { method: 'POST', body: JSON.stringify({ action }) }),
};
