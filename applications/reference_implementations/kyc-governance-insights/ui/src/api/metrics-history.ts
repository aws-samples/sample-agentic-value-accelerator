import { cfgEnv } from '../runtimeConfig';

const METRICS_API = cfgEnv('metrics_api_url', import.meta.env.VITE_METRICS_API_URL);
const API_KEY = cfgEnv('api_key', import.meta.env.VITE_API_KEY);
const TENANT_ID = cfgEnv('tenant_id', import.meta.env.VITE_TENANT_ID) || 'default';

/**
 * One day of seeded governance metrics from the kyc-metrics-history table
 * (populated by seed_phase3.py). All rate fields are fractions (0..1); time is
 * in seconds. Fields are optional so callers must tolerate a partially-seeded row.
 */
export interface MetricsHistoryRow {
  date: string;
  false_positive_rate?: number;
  escalation_rate?: number;
  time_to_decision_median_s?: number;
  override_rate?: number;
  stp_rate?: number;
  sar_conversion_rate?: number;
  agent_agreement_rate?: number;
  policy_trigger_rate?: number;
  eval_accuracy?: number;
  [key: string]: unknown;
}

/**
 * Fetch the seeded 30-day governance metric history via /svc/metrics/metrics-history.
 * Returns null (not an empty array) when the endpoint is unreachable or the table is
 * unseeded, so callers can render a "run the seed script" state instead of fake data.
 */
export async function fetchMetricsHistory(): Promise<MetricsHistoryRow[] | null> {
  if (!METRICS_API) return null;
  try {
    const res = await fetch(`${METRICS_API}/metrics-history`, {
      signal: AbortSignal.timeout(5000),
      headers: { ...(API_KEY ? { 'x-api-key': API_KEY } : {}), 'x-tenant-id': TENANT_ID },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data?.history ?? null);
    return Array.isArray(list) && list.length > 0 ? (list as MetricsHistoryRow[]) : null;
  } catch {
    return null;
  }
}
