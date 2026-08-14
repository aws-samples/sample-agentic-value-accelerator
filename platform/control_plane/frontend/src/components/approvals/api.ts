// Shared API client for Approval Policies (Secure) + Approval Requests (Operate).
// Auth interceptor mirrors the pattern used by harness/identity/mcp APIs so the
// Cognito JWT + dev-user-email header are attached to every call.
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const httpClient = axios.create({ baseURL: API_BASE, headers: { 'Content-Type': 'application/json' } });
httpClient.interceptors.request.use((c) => {
  const t = localStorage.getItem('auth_token');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  const e = localStorage.getItem('dev_user_email');
  if (e) c.headers['x-user-email'] = e;
  return c;
});

async function req<T>(method: 'get' | 'post' | 'patch' | 'delete', path: string, body?: unknown): Promise<T> {
  try {
    const r = await httpClient.request<T>({ url: path, method, data: body });
    return r.data;
  } catch (e) {
    const err = e as { response?: { status?: number; data?: unknown }; message?: string };
    const detail = (err.response?.data as { detail?: string })?.detail || err.message || 'Request failed';
    throw new Error(`${err.response?.status ?? '?'}: ${detail}`);
  }
}

// ─── Approval Policies (Secure) ─────────────────────────────────────────

export interface ApprovalPolicy {
  policy_id: string;
  name: string;
  description: string;
  resource_kind: string;
  resource_pattern: string;
  action_pattern: string;
  required_role: string;
  quorum: number;
  sla_hours: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ApprovalPolicyReference {
  resource_kinds: string[];
  action_verbs: string[];
  ava_roles: string[];
}

export interface ApprovalPolicyCreate {
  name: string;
  description?: string;
  resource_kind: string;
  resource_pattern?: string;
  action_pattern?: string;
  required_role?: string;
  quorum?: number;
  sla_hours?: number;
}

export type ApprovalPolicyUpdate = Partial<ApprovalPolicyCreate> & { status?: 'active' | 'disabled' };

const P = '/api/v1/approval-policies';
export const approvalPoliciesApi = {
  reference: () => req<ApprovalPolicyReference>('get', `${P}/reference`),
  list: () => req<{ policies: ApprovalPolicy[]; warning?: string }>('get', `${P}/list`),
  get: (id: string) => req<ApprovalPolicy>('get', `${P}/${id}`),
  create: (r: ApprovalPolicyCreate) => req<ApprovalPolicy>('post', P, r),
  update: (id: string, r: ApprovalPolicyUpdate) => req<ApprovalPolicy>('patch', `${P}/${id}`, r),
  remove: (id: string) => req<void>('delete', `${P}/${id}`),
  match: (resource_kind: string, resource_id: string, action: string) =>
    req<{ matches: ApprovalPolicy[] }>('post', `${P}/match`, { resource_kind, resource_id, action }),
};

// ─── Approval Requests (Operate) ─────────────────────────────────────────

export interface ApprovalDecision {
  by: string;
  outcome: 'approved' | 'denied' | 'cancelled';
  comment: string;
  at: string;
}

export interface ApprovalRequest {
  request_id: string;
  resource_kind: string;
  resource_id: string;
  resource_label: string;
  action: string;
  justification: string;
  policy_id: string;
  policy_name: string;
  required_role: string;
  quorum: number;
  sla_hours: number;
  requested_by: string;
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'cancelled';
  decisions: ApprovalDecision[];
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export interface ApprovalRequestCreate {
  resource_kind: string;
  resource_id: string;
  resource_label?: string;
  action: string;
  justification?: string;
  policy_id?: string;
  policy_name?: string;
  required_role?: string;
  quorum?: number;
  sla_hours?: number;
}

export interface ApprovalSummary {
  pending: number;
  approved: number;
  denied: number;
  expired: number;
  cancelled: number;
  total: number;
}

const R = '/api/v1/approval-requests';
export const approvalRequestsApi = {
  list: (status?: string) =>
    req<{ requests: ApprovalRequest[]; warning?: string }>('get', status ? `${R}/list?status=${status}` : `${R}/list`),
  get: (id: string) => req<ApprovalRequest>('get', `${R}/${id}`),
  create: (r: ApprovalRequestCreate) => req<ApprovalRequest>('post', R, r),
  approve: (id: string, comment?: string) => req<ApprovalRequest>('post', `${R}/${id}/approve`, { comment }),
  deny: (id: string, comment?: string) => req<ApprovalRequest>('post', `${R}/${id}/deny`, { comment }),
  cancel: (id: string, comment?: string) => req<ApprovalRequest>('post', `${R}/${id}/cancel`, { comment }),
  // Batch decision endpoints — process N request_ids in one server call.
  // The backend never fails the whole batch; per-row failures come back
  // in the `failed` array. UI shows a summary toast + refreshes.
  batchApprove: (request_ids: string[], comment?: string) =>
    req<BatchDecisionResult>('post', `${R}/batch-approve`, { request_ids, comment }),
  batchDeny: (request_ids: string[], comment?: string) =>
    req<BatchDecisionResult>('post', `${R}/batch-deny`, { request_ids, comment }),
  counts: () => req<ApprovalSummary>('get', `${R}/summary/counts`),
};

export interface BatchDecisionResult {
  outcome: 'approved' | 'denied';
  attempted: number;
  succeeded: string[];
  failed: Array<{ request_id: string; error: string }>;
}
