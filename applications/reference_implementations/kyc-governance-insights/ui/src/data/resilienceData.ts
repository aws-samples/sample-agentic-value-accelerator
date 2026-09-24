export interface ResilienceMetric {
  id: string;
  label: string;
  value: string;
  status: 'active' | 'tested' | 'planned';
  detail: string;
}

export const resilienceMetrics: ResilienceMetric[] = [
  { id: 'multi-az', label: 'Multi-AZ', value: 'Active', status: 'active', detail: 'All stateful components (DynamoDB, Lambda, AgentCore) span 3 AZs' },
  { id: 'dr', label: 'DR', value: 'RPO <1hr, RTO <4hr', status: 'tested', detail: 'Tested: 2026-06-15. Cross-region backup to eu-west-2' },
  { id: 'circuit-breakers', label: 'Circuit Breakers', value: '3/3 Active', status: 'active', detail: 'Bedrock (503 → fallback), DynamoDB (throttle → cache), Lambda (timeout → retry)' },
  { id: 'model-fallback', label: 'Model Fallback', value: 'Claude → Nova → Titan', status: 'active', detail: 'Auto-failover on 503/429. Latency budget preserved.' },
  { id: 'gameday', label: 'Last GameDay', value: '2026-06-20', status: 'tested', detail: 'Scenarios: Bedrock outage, DDB throttle, network partition. All passed.' },
];

export const securityDimensions = [
  { id: 'network', label: 'Network Isolation', score: 98, detail: 'VPC, PrivateLink, no public endpoints' },
  { id: 'encryption', label: 'Encryption', score: 100, detail: 'KMS CMK at rest, TLS 1.3 in transit' },
  { id: 'identity', label: 'Identity', score: 95, detail: 'Per-agent IAM, STS sessions, permission boundaries' },
  { id: 'observability', label: 'Observability', score: 97, detail: 'CloudTrail 100%, X-Ray traces, flow logs' },
  { id: 'resilience', label: 'Resilience', score: 92, detail: 'Multi-AZ, failover tested, circuit breakers' },
];

export const compositeSecurityScore = 96;
