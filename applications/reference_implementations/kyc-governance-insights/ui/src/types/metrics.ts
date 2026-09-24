export interface LiveMetrics {
  decisions_today: number;
  decisions_total: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  accuracy_pct: number;
  safety_violations: number;
  hitl_pending_count: number;
  tokens_used_today: number;
  tokens_budget_daily: number;
  cost_today_usd: number;
  cost_budget_daily_usd: number;
  cost_per_decision_usd: number;
  model_routing: ModelRoutingEntry[];
  error_rate_pct: number;
  uptime_pct: number;
  active_agents: number;
  timestamp: string;
  source: 'cloudwatch' | 'mock';
  region: string;
}

export interface ModelRoutingEntry {
  model_id: string;
  model_name: string;
  percentage: number;
  requests_today: number;
  avg_latency_ms: number;
  color: string;
}

export interface MetricsState {
  current: LiveMetrics | null;
  history: LiveMetrics[];
  status: 'connecting' | 'live' | 'stale' | 'error' | 'simulated';
  lastUpdated: Date | null;
  error: string | null;
}

export interface MetricsApiResponse {
  metrics: LiveMetrics;
  next_refresh_ms: number;
}
