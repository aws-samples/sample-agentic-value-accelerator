import type { LiveMetrics } from '../types/metrics';

export const FALLBACK_METRICS: LiveMetrics = {
  decisions_today: 67,
  decisions_total: 12_483,
  avg_latency_ms: 2_847,
  p95_latency_ms: 4_920,
  accuracy_pct: 96.2,
  safety_violations: 0,
  hitl_pending_count: 3,
  tokens_used_today: 847_000,
  tokens_budget_daily: 1_200_000,
  cost_today_usd: 12.84,
  cost_budget_daily_usd: 15.00,
  cost_per_decision_usd: 0.42,
  model_routing: [
    { model_id: 'anthropic.claude-sonnet-4-5', model_name: 'Claude Sonnet 4.5', percentage: 55, requests_today: 37, avg_latency_ms: 2800, color: '#3b82f6' },
    { model_id: 'amazon.nova-pro-v1', model_name: 'Amazon Nova Pro', percentage: 30, requests_today: 20, avg_latency_ms: 1900, color: '#8b5cf6' },
    { model_id: 'anthropic.claude-haiku-3-5', model_name: 'Claude Haiku 3.5', percentage: 15, requests_today: 10, avg_latency_ms: 1200, color: '#10b981' },
  ],
  error_rate_pct: 0.3,
  uptime_pct: 99.94,
  active_agents: 2,
  timestamp: new Date().toISOString(),
  source: 'mock',
  region: 'us-east-1',
};
