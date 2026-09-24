// Evaluation API client. Demo fallback fires ONLY when the backend is
// unreachable (network error / timeout). An HTTP error from a live backend
// is a real answer and is surfaced as `error` — never masked with demo data,
// because a module about earned trust must not fabricate its own results.

import type { EvalCase, EvaluatedApp, EvalRun, OptimizationRec, PairwiseResult, StoredSuite } from './types';
import { DEMO_APPS, DEMO_RUNS } from './demoData';

// Platform convention (see components/memory/api.ts): the deployed frontend
// reaches the backend via the URL baked in at build time; local dev talks to
// the local backend directly (CORS is enabled platform-wide).
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const BASE = `${API_BASE}/api/v1/evaluations`;

// Cognito JWT + dev-user-email — same headers the shared axios client sends,
// so deployed environments don't 401 these fetches.
export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = localStorage.getItem('auth_token');
  if (token) headers.Authorization = `Bearer ${token}`;
  const devUserEmail = localStorage.getItem('dev_user_email');
  if (devUserEmail) headers['x-user-email'] = devUserEmail;
  return headers;
}

// Absolute URL for direct consumers (SSE, report downloads).
export function apiUrl(path: string): string {
  return `${BASE}${path}`;
}

// Reports are fetched with auth headers and opened/saved as blobs — a plain
// <a href> can't attach the Authorization header in deployed environments.
export async function openReport(path: string, filename?: string): Promise<void> {
  const res = await fetch(apiUrl(path), { headers: authHeaders() });
  if (!res.ok) throw new Error(`Report failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  } else {
    window.open(url, '_blank', 'noopener');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

class HttpError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(`HTTP ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

async function tryFetch<T>(path: string, init?: RequestInit, timeoutMs = 12000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...authHeaders(), ...(init?.headers as Record<string, string> | undefined) },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new HttpError(res.status, (body as { detail?: string } | null)?.detail ?? `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export interface ApiResult<T> {
  data: T;
  demo: boolean;
  error?: string;
}

export const evaluationApi = {
  async listApps(): Promise<ApiResult<EvaluatedApp[]>> {
    try {
      return { data: await tryFetch<EvaluatedApp[]>('/apps'), demo: false };
    } catch (e) {
      // 404 = live backend with an empty account — the demo catalog is the
      // designed empty-state. Other HTTP errors are surfaced.
      if (e instanceof HttpError && e.status !== 404) return { data: [], demo: false, error: e.detail };
      return { data: DEMO_APPS, demo: true };
    }
  },

  async getApp(deploymentId: string): Promise<ApiResult<EvaluatedApp | undefined>> {
    try {
      return { data: await tryFetch<EvaluatedApp>(`/apps/${encodeURIComponent(deploymentId)}`), demo: false };
    } catch (e) {
      if (e instanceof HttpError && e.status !== 404) return { data: undefined, demo: false, error: e.detail };
      return { data: DEMO_APPS.find((a) => a.deploymentId === deploymentId), demo: true };
    }
  },

  async getRun(runId: string): Promise<ApiResult<EvalRun | undefined>> {
    try {
      return { data: await tryFetch<EvalRun>(`/runs/${encodeURIComponent(runId)}`), demo: false };
    } catch (e) {
      if (e instanceof HttpError) {
        // A 404 for an id that exists ONLY in the demo catalog means the app
        // being viewed came from demo fallback — stay consistently in demo
        // mode. Real ids still surface honestly as not-found.
        if (e.status === 404 && DEMO_RUNS[runId]) return { data: DEMO_RUNS[runId], demo: true };
        return { data: undefined, demo: false, error: e.status === 404 ? undefined : e.detail };
      }
      // Backend unreachable: serve only a KNOWN demo run — never reshape
      // demo data under a real run id.
      return { data: DEMO_RUNS[runId], demo: true };
    }
  },

  async startRun(deploymentId: string): Promise<ApiResult<{ runId: string } | null>> {
    try {
      return {
        data: await tryFetch<{ runId: string }>('/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deployment_id: deploymentId }),
        }),
        demo: false,
      };
    } catch (e) {
      if (e instanceof HttpError) return { data: null, demo: false, error: e.detail };
      return { data: { runId: 'run-kyc-005' }, demo: true };
    }
  },

  // Head-to-head pairwise battle between two completed runs. Dozens of judge
  // calls server-side (cached per pair afterwards) — extended timeout.
  // Battles run async server-side (minutes of judge calls vs API Gateway's
  // ~29s cap): the POST returns cached results instantly or
  // {status:'generating'} — callers re-POST until battles appear.
  async pairwise(
    runIdA: string,
    runIdB: string,
  ): Promise<{ data: PairwiseResult | null; generating: boolean; error?: string }> {
    try {
      const res = await tryFetch<PairwiseResult & { status?: string; error?: string }>(
        '/compare/pairwise',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ run_id_a: runIdA, run_id_b: runIdB }),
        },
        30000,
      );
      if (res.battles) return { data: res, generating: false };
      if (res.status === 'generating') return { data: null, generating: true };
      return { data: null, generating: false, error: res.error ?? 'Pairwise comparison failed.' };
    } catch (e) {
      if (e instanceof HttpError) {
        // Gateway timeout while the backend keeps judging — poll.
        if (e.status === 503 || e.status === 504) return { data: null, generating: true };
        return { data: null, generating: false, error: e.detail };
      }
      return { data: null, generating: false, error: 'Backend unreachable' };
    }
  },

  // Judge playground: score one (input, expected, response) triple live.
  async judgePreview(payload: {
    input: string;
    expectedBehavior: string;
    agentResponse: string;
    evaluatorIds?: string[];
  }): Promise<ApiResult<{ cases: EvalCase[] } | null>> {
    try {
      return {
        data: await tryFetch<{ cases: EvalCase[] }>(
          '/judge-preview',
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
          120000,
        ),
        demo: false,
      };
    } catch (e) {
      if (e instanceof HttpError) return { data: null, demo: false, error: e.detail };
      return { data: null, demo: true, error: 'Backend unreachable' };
    }
  },

  // Auto-enrollment: draft a suite scaffold for a deployment with none.
  // One advisory model call server-side, hence the extended timeout.
  async enroll(deploymentId: string): Promise<ApiResult<{ suiteId: string; caseCount: number } | null>> {
    try {
      return {
        data: await tryFetch<{ suiteId: string; caseCount: number }>(
          `/apps/${encodeURIComponent(deploymentId)}/enroll`,
          { method: 'POST' },
          60000,
        ),
        demo: false,
      };
    } catch (e) {
      if (e instanceof HttpError) return { data: null, demo: false, error: e.detail };
      return { data: null, demo: true, error: 'Backend unreachable' };
    }
  },

  // Optimization advice for a completed run. Generation runs async server-side
  // (API Gateway caps requests at ~29s): cached results return immediately,
  // otherwise {status:'generating'} — poll getRun until the recommendations
  // (or recommendationsError) appear on the run record.
  async recommendations(
    runId: string,
  ): Promise<{ data: OptimizationRec[] | null; generating: boolean; error?: string }> {
    try {
      const res = await tryFetch<{ recommendations?: OptimizationRec[]; status?: string }>(
        `/runs/${encodeURIComponent(runId)}/recommendations`,
        { method: 'POST' },
        30000,
      );
      if (res.recommendations) return { data: res.recommendations, generating: false };
      return { data: null, generating: res.status === 'generating' };
    } catch (e) {
      if (e instanceof HttpError) {
        // Gateway timeout while the backend keeps working — treat as generating.
        if (e.status === 503 || e.status === 504) return { data: null, generating: true };
        return { data: null, generating: false, error: e.detail };
      }
      return { data: null, generating: false, error: 'Backend unreachable' };
    }
  },

  // All suite versions for a deployment, newest first (index 0 = what Run
  // Evaluation uses). Empty on any failure — the versions panel just hides.
  async listSuites(
    deploymentId: string,
  ): Promise<{ id: string; name: string; createdAt: string; caseCount: number }[]> {
    try {
      return await tryFetch(`/apps/${encodeURIComponent(deploymentId)}/suites`);
    } catch {
      return [];
    }
  },

  // Operator cleanup for runs whose scores are known garbage (e.g. a crashed
  // agent's error output judged before loud-fail detection existed).
  async deleteRun(runId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await tryFetch(`/runs/${encodeURIComponent(runId)}`, { method: 'DELETE' });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof HttpError ? e.detail : 'Backend unreachable' };
    }
  },

  async deleteSuite(suiteId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await tryFetch(`/suites/${encodeURIComponent(suiteId)}`, { method: 'DELETE' });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof HttpError ? e.detail : 'Backend unreachable' };
    }
  },

  // Latest suite for a deployment, so the builder opens pre-filled with the
  // current cases. Any failure (no suite yet, demo mode, backend down) just
  // means "start blank" — no error surfacing needed here.
  async getSuite(deploymentId: string): Promise<StoredSuite | null> {
    try {
      return await tryFetch<StoredSuite>(`/apps/${encodeURIComponent(deploymentId)}/suite`);
    } catch {
      return null;
    }
  },

  async createSuite(payload: unknown): Promise<ApiResult<{ suiteId: string } | null>> {
    try {
      return {
        data: await tryFetch<{ suiteId: string }>('/suites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
        demo: false,
      };
    } catch (e) {
      if (e instanceof HttpError) return { data: null, demo: false, error: e.detail };
      return { data: { suiteId: `suite-demo-${Date.now()}` }, demo: true };
    }
  },
};
