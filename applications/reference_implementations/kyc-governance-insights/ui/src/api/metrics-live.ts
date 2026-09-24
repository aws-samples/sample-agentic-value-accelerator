import { cfgEnv } from '../runtimeConfig';
const METRICS_API = cfgEnv('metrics_api_url', import.meta.env.VITE_METRICS_API_URL);
const API_KEY = cfgEnv('api_key', import.meta.env.VITE_API_KEY);
const TENANT_ID = cfgEnv('tenant_id', import.meta.env.VITE_TENANT_ID) || 'default';

export interface CloudWatchMetrics {
  invocations: number;
  avgDuration: number;
  errorRate: number;
  guardrailInterventions: number;
  timestamp: string;
}

export interface XRayTrace {
  traceId: string;
  duration: number;
  responseTime: number;
  http: { status: number };
  annotations: Record<string, string>;
}

export interface WafStats {
  blockedRequests: number;
  allowedRequests: number;
  countedRequests: number;
  period: string;
}

export async function fetchLiveMetrics(): Promise<CloudWatchMetrics | null> {
  if (!METRICS_API) return null;
  const res = await fetch(`${METRICS_API}/metrics`, { signal: AbortSignal.timeout(5000), headers: { ...(API_KEY ? { 'x-api-key': API_KEY } : {}), 'x-tenant-id': TENANT_ID } });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchTraces(limit = 50): Promise<XRayTrace[] | null> {
  if (!METRICS_API) return null;
  const res = await fetch(`${METRICS_API}/traces?limit=${limit}`, { signal: AbortSignal.timeout(5000), headers: { ...(API_KEY ? { 'x-api-key': API_KEY } : {}), 'x-tenant-id': TENANT_ID } });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchWafStats(): Promise<WafStats | null> {
  if (!METRICS_API) return null;
  const res = await fetch(`${METRICS_API}/waf-stats`, { signal: AbortSignal.timeout(5000), headers: { ...(API_KEY ? { 'x-api-key': API_KEY } : {}), 'x-tenant-id': TENANT_ID } });
  if (!res.ok) return null;
  return res.json();
}
