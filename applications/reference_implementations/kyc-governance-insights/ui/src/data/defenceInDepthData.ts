export interface LayerComponent {
  name: string;
  role: string;
  config: string;
}

export interface DefenceLayer {
  id: string;
  name: string;
  description: string;
  color: string;
  components: LayerComponent[];
  controlCount: number;
}

export const defenceLayers: DefenceLayer[] = [
  { id: 'network', name: 'Network Perimeter', description: 'DDoS protection, web application firewall, CDN edge caching', color: '#1e3a5f', controlCount: 3, components: [
    { name: 'AWS WAF', role: 'SQL injection, XSS, bot filtering', config: '47 managed rules active' },
    { name: 'CloudFront', role: 'Edge caching, TLS 1.3 termination', config: 'HSTS, geo-restriction' },
    { name: 'Shield Advanced', role: 'DDoS mitigation', config: 'Auto-scaling response, 24/7 DRT' },
  ]},
  { id: 'identity', name: 'Identity & Access', description: 'Authentication, authorization, least privilege enforcement', color: '#4c1d95', controlCount: 4, components: [
    { name: 'IAM Roles', role: 'Per-agent least privilege', config: 'Session-scoped, auto-rotate' },
    { name: 'STS Sessions', role: 'Temporary credentials', config: '1hr max duration' },
    { name: 'Permission Boundaries', role: 'Ceiling on agent permissions', config: 'Cannot self-escalate' },
    { name: 'API Key Auth', role: 'Gateway authentication', config: 'Per-client throttling' },
  ]},
  { id: 'runtime', name: 'Runtime Policy', description: 'Cedar policy enforcement, content filtering, guardrails', color: '#065f46', controlCount: 5, components: [
    { name: 'Cedar Policies (12)', role: 'Deterministic authorization', config: 'Most-restrictive-wins' },
    { name: 'Bedrock Guardrails', role: 'Content/PII/grounding', config: 'Input + Output scan' },
    { name: 'Gateway Interceptors', role: 'Pre/post hooks', config: 'Every API call validated' },
    { name: 'Rate Limits', role: 'Per-agent throttling', config: '100 decisions/hour max' },
    { name: 'Model Allowlist', role: 'Approved models only', config: 'Claude, Nova, Haiku' },
  ]},
  { id: 'application', name: 'Application Logic', description: 'Evaluators, HITL gates, deterministic validators', color: '#78350f', controlCount: 4, components: [
    { name: '10 Evaluators', role: 'Quality scoring pipeline', config: '4 hard gates, 6 soft' },
    { name: 'HITL Escalation', role: 'Human decision for high-risk', config: 'Step Functions workflow' },
    { name: 'Lambda Validators', role: 'Independent recalculation', config: 'Sanctions, credit, schema' },
    { name: 'QA Research Agent', role: 'Qualitative spot-check', config: '10% random sampling' },
  ]},
  { id: 'data', name: 'Data Storage', description: 'Encryption at rest, access logging, retention policies', color: '#1f2937', controlCount: 4, components: [
    { name: 'KMS (CMK)', role: 'Encryption at rest', config: 'AES-256-GCM, auto-rotation' },
    { name: 'DynamoDB', role: 'State + audit trail', config: 'TTL auto-expiry, VPC endpoint' },
    { name: 'S3 Object Lock', role: 'Immutable audit artifacts', config: 'GOVERNANCE mode, 7yr retention' },
    { name: 'CloudTrail', role: '100% API logging', config: 'Organization trail, S3 delivery' },
  ]},
];
