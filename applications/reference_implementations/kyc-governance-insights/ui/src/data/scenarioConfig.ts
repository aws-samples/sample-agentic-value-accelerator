import type { ScenarioId } from '../types/simulation';

export interface ScenarioConfig {
  id: ScenarioId;
  label: string;
  description: string;
  backend: 'simulated' | 'agentcore';
  endpoint: string;
  request: {
    customer_id: string;
    assessment_type: string;
  };
  fallbackDataKey: string;
}

export const SCENARIO_CONFIGS: Record<ScenarioId, ScenarioConfig> = {
  approve: {
    id: 'approve',
    label: 'Scenario A — Standard Approval',
    description: 'Low-risk customer, automated approval path',
    backend: 'agentcore',
    endpoint: '/api',
    request: { customer_id: 'CUST001', assessment_type: 'full' },
    fallbackDataKey: 'FALLBACK_RESPONSE',
  },
  block: {
    id: 'block',
    label: 'Scenario B — Policy Block (LIVE)',
    description: 'High-risk customer, sanctions hit, Cedar policy triggers block',
    backend: 'agentcore',
    endpoint: '/api-b',
    request: { customer_id: 'CUST047', assessment_type: 'full' },
    fallbackDataKey: 'FALLBACK_RESPONSE_BLOCK',
  },
};
