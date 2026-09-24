export interface Threat {
  id: string;
  name: string;
  likelihood: 'high' | 'medium' | 'low';
  impact: 'high' | 'medium' | 'low';
  description: string;
  mitreRef: string;
  controls: string[];
  residualRisk: string;
}

export const threats: Threat[] = [
  { id: 't1', name: 'Token Abuse', likelihood: 'high', impact: 'low', description: 'Excessive token consumption from misconfigured agent loops or adversarial prompts.', mitreRef: 'ATLAS ML06', controls: ['Token budget', 'Rate limiting', 'Circuit breaker'], residualRisk: 'Low — budget caps prevent runaway' },
  { id: 't2', name: 'Prompt Injection', likelihood: 'high', impact: 'medium', description: 'Adversarial instructions hidden in customer documents attempting to hijack agent behavior.', mitreRef: 'OWASP LLM01', controls: ['Bedrock Guardrails (input)', 'WAF rules', 'Cedar policy'], residualRisk: 'Low — multi-layer filtering active' },
  { id: 't3', name: 'Agent Hijacking', likelihood: 'high', impact: 'high', description: 'Complete takeover of agent execution flow via sophisticated multi-turn manipulation.', mitreRef: 'ATLAS ML05', controls: ['VPC isolation', 'IAM boundaries', 'Kill switch', 'Cedar forbid'], residualRisk: 'Very Low — deterministic gates cannot be bypassed' },
  { id: 't4', name: 'Data Leakage', likelihood: 'medium', impact: 'low', description: 'PII or sensitive financial data exposed in logs, traces, or responses.', mitreRef: 'OWASP LLM06', controls: ['Guardrails PII', 'KMS encryption', 'VPC endpoints'], residualRisk: 'Low — automated PII redaction active' },
  { id: 't5', name: 'Model Drift', likelihood: 'medium', impact: 'medium', description: 'Silent degradation of model accuracy over time without visible errors.', mitreRef: 'ATLAS ML07', controls: ['Continuous eval', 'CloudWatch alarms', 'Auto-tighten'], residualRisk: 'Medium — detection active, remediation manual' },
  { id: 't6', name: 'Cross-Agent Escalation', likelihood: 'medium', impact: 'high', description: 'One compromised agent uses inter-agent communication to escalate privileges.', mitreRef: 'ATLAS ML09', controls: ['Per-agent IAM', 'Supervisor agent', 'Cedar scope limits'], residualRisk: 'Low — agents cannot grant each other permissions' },
  { id: 't7', name: 'Supply Chain', likelihood: 'low', impact: 'low', description: 'Compromise of third-party library or model provider infrastructure.', mitreRef: 'MITRE T1195', controls: ['Pinned versions', 'SRI hashes', 'AWS-hosted models only'], residualRisk: 'Very Low — no external dependencies at runtime' },
  { id: 't8', name: 'Goal Misalignment', likelihood: 'low', impact: 'medium', description: 'Agent optimizes for wrong objective (e.g., speed over accuracy).', mitreRef: 'ATLAS ML03', controls: ['QA Research Agent', 'Multi-evaluator pipeline', 'Human spot-check'], residualRisk: 'Low — qualitative review catches metric gaming' },
  { id: 't9', name: 'Full System Compromise', likelihood: 'low', impact: 'high', description: 'Complete infrastructure takeover via chained exploits.', mitreRef: 'MITRE TA0040', controls: ['Multi-AZ', 'GuardDuty', 'Shield Advanced', 'IR playbook'], residualRisk: 'Very Low — defence in depth, blast radius limited' },
];
