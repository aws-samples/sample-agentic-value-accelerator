import { cfgEnv } from '../runtimeConfig';

export interface PendingDecision {
  taskTokenHash: string;
  executionId: string;
  agentId: string;
  actionType: string;
  actionPayload: Record<string, unknown>;
  riskScore: number;
  riskTier: string;
  customerName: string;
  requestedAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  deliberationSeconds?: number;
}

export interface DecisionSubmission {
  taskToken: string;
  decision: 'APPROVED' | 'REJECTED';
  reviewerId: string;
  reason: string;
  deliberationSeconds: number;
}

export interface DecisionResponse {
  success: boolean;
  executionId?: string;
  error?: string;
}

function getHitlApiUrl(): string {
  return cfgEnv('hitl_api_url', import.meta.env.VITE_HITL_API_URL);
}

const HITL_API = cfgEnv('hitl_api_url', import.meta.env.VITE_HITL_API_URL);
const API_KEY = cfgEnv('api_key', import.meta.env.VITE_API_KEY);
const TENANT_ID = cfgEnv('tenant_id', import.meta.env.VITE_TENANT_ID) || 'default';

export async function fetchPendingDecisions(): Promise<PendingDecision[]> {
  const baseUrl = getHitlApiUrl();
  if (!baseUrl) return MOCK_PENDING_DECISIONS;

  try {
    const headers: Record<string, string> = { 'x-tenant-id': TENANT_ID };
    if (API_KEY) headers['x-api-key'] = API_KEY;
    const res = await fetch(`${baseUrl}/api/v1/hitl/pending`, {
      signal: AbortSignal.timeout(8000),
      headers,
    });
    if (!res.ok) return MOCK_PENDING_DECISIONS;
    const data = await res.json();
    return data.items || data.reviews || [];
  } catch {
    return MOCK_PENDING_DECISIONS;
  }
}

export async function submitDecision(submission: DecisionSubmission): Promise<DecisionResponse> {
  const baseUrl = getHitlApiUrl();
  if (!baseUrl) {
    return { success: true, executionId: 'mock-exec-001' };
  }

  const res = await fetch(`${baseUrl}/api/v1/hitl/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': TENANT_ID },
    body: JSON.stringify(submission),
  });

  if (!res.ok) {
    const text = await res.text();
    return { success: false, error: text || `HTTP ${res.status}` };
  }

  return await res.json();
}

const MOCK_PENDING_DECISIONS: PendingDecision[] = [
  {
    taskTokenHash: 'tk-hash-001',
    executionId: 'arn:aws:states:us-east-1:<YOUR_ACCOUNT_ID>:execution:hitl-agent-review:omega-trading-001',
    agentId: 'credit-analyst-L1',
    actionType: 'approve_credit_facility',
    actionPayload: { amount: 500000, currency: 'GBP', customer: 'Omega Trading Ltd', risk_score: 0.92 },
    riskScore: 0.92,
    riskTier: 'MLRO',
    customerName: 'Omega Trading Ltd',
    requestedAt: new Date(Date.now() - 180_000).toISOString(),
    status: 'PENDING',
  },
  {
    taskTokenHash: 'tk-hash-002',
    executionId: 'arn:aws:states:us-east-1:<YOUR_ACCOUNT_ID>:execution:hitl-agent-review:petrov-kyc-002',
    agentId: 'compliance-officer-L2',
    actionType: 'onboard_pep_client',
    actionPayload: { amount: 4200000, currency: 'GBP', customer: 'Dr Mikhail Petrov', pep_level: 3 },
    riskScore: 0.97,
    riskTier: 'Board',
    customerName: 'Dr Mikhail Petrov',
    requestedAt: new Date(Date.now() - 600_000).toISOString(),
    status: 'PENDING',
  },
];

export async function fetchPendingReviews(): Promise<any[] | null> {
  if (!HITL_API) return null;
  try {
    const headers: Record<string, string> = { 'x-tenant-id': TENANT_ID };
    if (API_KEY) headers['x-api-key'] = API_KEY;
    const res = await fetch(`${HITL_API}/api/v1/hitl/pending`, { signal: AbortSignal.timeout(5000), headers: Object.keys(headers).length ? headers : undefined });
    if (!res.ok) return null;
    const data = await res.json();
    return data.reviews || data.items || [];
  } catch { return null; }
}

export async function submitHitlDecision(reviewId: string, decision: 'approve' | 'reject', notes?: string): Promise<boolean> {
  if (!HITL_API) return false;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-tenant-id': TENANT_ID };
    if (API_KEY) headers['x-api-key'] = API_KEY;
    const res = await fetch(`${HITL_API}/api/v1/hitl/decision`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reviewId, decision: decision.toUpperCase(), notes }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch { return false; }
}
