import type { MetricsApiResponse, LiveMetrics, ModelRoutingEntry } from '../types/metrics';

export function generateMockMetrics(): MetricsApiResponse {
  const metrics: LiveMetrics = {
    decisions_today: randomInt(45, 78),
    decisions_total: randomInt(12400, 12600),
    avg_latency_ms: randomInt(2100, 3400),
    p95_latency_ms: randomInt(4200, 5800),
    accuracy_pct: randomFloat(94.1, 97.8),
    safety_violations: randomInt(0, 2),
    hitl_pending_count: randomInt(1, 5),
    tokens_used_today: randomInt(720000, 890000),
    tokens_budget_daily: 1_200_000,
    cost_today_usd: randomFloat(8.40, 14.20),
    cost_budget_daily_usd: 15.00,
    cost_per_decision_usd: randomFloat(0.28, 0.55),
    model_routing: generateModelRouting(),
    error_rate_pct: randomFloat(0.1, 1.2),
    uptime_pct: randomFloat(99.7, 99.99),
    active_agents: randomInt(2, 4),
    timestamp: new Date().toISOString(),
    source: 'mock',
    region: 'us-east-1',
  };

  return { metrics, next_refresh_ms: 30_000 };
}

function generateModelRouting(): ModelRoutingEntry[] {
  const base = [
    { model_id: 'anthropic.claude-sonnet-4-5', model_name: 'Claude Sonnet 4.5', color: '#3b82f6' },
    { model_id: 'amazon.nova-pro-v1', model_name: 'Amazon Nova Pro', color: '#8b5cf6' },
    { model_id: 'anthropic.claude-haiku-3-5', model_name: 'Claude Haiku 3.5', color: '#10b981' },
  ];
  const pcts = randomSplit(100, 3);
  return base.map((m, i) => ({
    ...m,
    percentage: pcts[i],
    requests_today: randomInt(10, 50),
    avg_latency_ms: randomInt(1200, 4000),
  }));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function randomSplit(total: number, n: number): number[] {
  const parts: number[] = [];
  let remaining = total;
  for (let i = 0; i < n - 1; i++) {
    const max = remaining - (n - i - 1);
    const val = randomInt(Math.floor(remaining * 0.2), Math.floor(max * 0.7));
    parts.push(val);
    remaining -= val;
  }
  parts.push(remaining);
  return parts.sort((a, b) => b - a);
}
