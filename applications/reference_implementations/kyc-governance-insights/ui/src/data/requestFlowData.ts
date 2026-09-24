export interface FlowStep {
  id: string;
  label: string;
  description: string;
  latencyMs: number;
  icon: string;
  color: string;
}

export const executiveFlow: FlowStep[] = [
  { id: 'input', label: 'Input', description: 'Customer submits documents', latencyMs: 0, icon: '\uD83D\uDCC4', color: '#3b82f6' },
  { id: 'governed-ai', label: 'Governed AI', description: '7 independent checkpoints', latencyMs: 540, icon: '\uD83E\uDD16', color: '#10b981' },
  { id: 'output', label: 'Output', description: 'Decision delivered', latencyMs: 20, icon: '\u2705', color: '#8b5cf6' },
];

export const businessOpsFlow: FlowStep[] = [
  { id: 'submit', label: 'Customer Submits', description: 'Documents uploaded via portal', latencyMs: 12, icon: '\uD83D\uDCC4', color: '#3b82f6' },
  { id: 'process', label: 'Agent Processes', description: 'AI reads and analyses documents', latencyMs: 45, icon: '\uD83E\uDD16', color: '#06b6d4' },
  { id: 'tools', label: 'Tools Called', description: 'Sanctions check, PEP screening, credit', latencyMs: 280, icon: '\u2699\uFE0F', color: '#8b5cf6' },
  { id: 'policy', label: 'Policy Checks', description: 'Cedar policies evaluate decision', latencyMs: 40, icon: '\uD83D\uDEE1\uFE0F', color: '#f59e0b' },
  { id: 'decide', label: 'Decision Made', description: 'APPROVE/REJECT/ESCALATE', latencyMs: 20, icon: '\u2705', color: '#10b981' },
  { id: 'review', label: 'Human Review', description: 'If needed (high risk only)', latencyMs: 0, icon: '\uD83D\uDC64', color: '#ec4899' },
];

export const complianceFlow: FlowStep[] = [
  { id: 'tls', label: 'TLS 1.3 Ingress', description: 'Encrypted transport from client', latencyMs: 5, icon: '\uD83D\uDD12', color: '#10b981' },
  { id: 'waf', label: 'WAF + Input Validation', description: 'Injection protection, rate limiting', latencyMs: 8, icon: '\uD83D\uDEE1\uFE0F', color: '#f59e0b' },
  { id: 'cedar1', label: 'Cedar Policy Gate #1', description: 'Request authorization', latencyMs: 3, icon: '\uD83D\uDCCB', color: '#8b5cf6' },
  { id: 'guardrail-in', label: 'Guardrail: PII Redaction', description: 'PII stripped before logging', latencyMs: 30, icon: '\uD83D\uDEE1\uFE0F', color: '#ef4444' },
  { id: 'cedar2', label: 'Cedar Policy Gate #2', description: 'Tool authorization', latencyMs: 3, icon: '\uD83D\uDCCB', color: '#8b5cf6' },
  { id: 'cedar3', label: 'Cedar Policy Gate #3', description: 'Threshold/scope check', latencyMs: 3, icon: '\uD83D\uDCCB', color: '#8b5cf6' },
  { id: 'guardrail-out', label: 'Guardrail: Grounding', description: 'Output grounding validation', latencyMs: 18, icon: '\uD83D\uDEE1\uFE0F', color: '#f59e0b' },
  { id: 'audit', label: 'Audit Trail Capture', description: 'Immutable log written', latencyMs: 5, icon: '\uD83D\uDCDD', color: '#06b6d4' },
];

export const engineeringFlow: FlowStep[] = [
  { id: 'cf', label: 'CloudFront (Edge)', description: 'TLS 1.3 termination, HSTS', latencyMs: 5, icon: '\uD83C\uDF10', color: '#64748b' },
  { id: 'waf', label: 'AWS WAF', description: '47 managed rules, bot detection', latencyMs: 8, icon: '\uD83D\uDD25', color: '#ef4444' },
  { id: 'apigw', label: 'API Gateway', description: 'REST proxy, API key validation', latencyMs: 12, icon: '\uD83D\uDEAA', color: '#8b5cf6' },
  { id: 'iam', label: 'IAM Auth', description: 'role/kyc-api-exec, STS session', latencyMs: 3, icon: '\uD83D\uDD11', color: '#f59e0b' },
  { id: 'orch', label: 'Orchestrator (ECS)', description: 'AgentCore runtime, private subnet', latencyMs: 15, icon: '\u2699\uFE0F', color: '#06b6d4' },
  { id: 'cedar-eval', label: 'Cedar Eval', description: 'kyc-standard-cdd policy', latencyMs: 3, icon: '\uD83D\uDCCB', color: '#8b5cf6' },
  { id: 'bedrock', label: 'Bedrock (PrivateLink)', description: 'Claude Sonnet 4.5 inference', latencyMs: 280, icon: '\uD83E\uDDE0', color: '#3b82f6' },
  { id: 'guardrail', label: 'Bedrock Guardrails', description: 'Input + Output scan', latencyMs: 30, icon: '\uD83D\uDEE1\uFE0F', color: '#10b981' },
  { id: 'tools', label: 'MCP Tool Server', description: 'sanctions_db, pep_screening', latencyMs: 120, icon: '\u26A1', color: '#f59e0b' },
  { id: 'ddb', label: 'DynamoDB (VPC EP)', description: 'KMS CMK, audit write', latencyMs: 8, icon: '\uD83D\uDDC4\uFE0F', color: '#10b981' },
  { id: 'otel', label: 'OTel → CloudWatch', description: 'Span complete, metrics emitted', latencyMs: 5, icon: '\uD83D\uDCCA', color: '#64748b' },
  { id: 'decision', label: 'Decision Response', description: 'APPROVE (560ms total)', latencyMs: 5, icon: '\u2705', color: '#10b981' },
];
