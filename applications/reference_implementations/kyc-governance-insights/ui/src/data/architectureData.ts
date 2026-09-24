export interface ArchItem {
  label: string;
  description: string;
  status: 'active' | 'experimental' | 'planned';
  usedInSteps?: string;    // R2: which stages use this
  mitigatesRisks?: string; // R6: which risks this helps mitigate
}

export interface ArchColumn {
  title: string;
  titleColor: string;
  items: string[];
  note: string;
  noteColor: string;
  isPrimary?: boolean;
  subGrid?: { title: string; description: string }[];
}

/* Active services — deployed and working */
export const activeServices: ArchItem[] = [
  { label: 'Amazon Bedrock', description: 'Foundation model inference (Claude, Titan) for the KYC agent.', status: 'active', usedInSteps: 'Steps 1-7', mitigatesRisks: 'Core inference — all risks' },
  { label: 'Bedrock Guardrails', description: '7 policy types: content filters, denied topics, word filters, PII protection (23 entities), contextual grounding, automated reasoning, prompt attack detection. 50+ rules firing in parallel on all model I/O.', status: 'active', usedInSteps: 'Steps 1, 3, 4, 7', mitigatesRisks: 'Injection, Hallucination, PII Leakage' },
  { label: 'AgentCore Runtime', description: 'Manages agent lifecycle, deployment, and runtime orchestration.', status: 'active', usedInSteps: 'Steps 1-7', mitigatesRisks: 'Agent Conflict, Drift' },
  { label: 'AgentCore Gateway', description: 'API proxy that routes, authenticates, and rate-limits agent invocations.', status: 'active', usedInSteps: 'Steps 1, 4, 5', mitigatesRisks: 'Blast Radius, Scope Exceedance' },
  { label: 'AWS Lambda', description: 'Deterministic validation checks (sanctions, credit score, schema) + LLM-as-Judge evaluation.', status: 'active', usedInSteps: 'Steps 3, 4, 5', mitigatesRisks: 'Hallucination, Bias, Missed Positives' },
  { label: 'DynamoDB', description: 'Agent Registry storage + sanctions database + policy configuration.', status: 'active', usedInSteps: 'Steps 1, 3, 4', mitigatesRisks: 'Stale Data, Scope Exceedance' },
  { label: 'S3', description: 'Customer document storage for KYC evidence and source materials.', status: 'active', usedInSteps: 'Step 1 (ingestion)', mitigatesRisks: 'Data integrity' },
  { label: 'CloudWatch + X-Ray', description: 'Metrics, alarms, distributed tracing, and dashboards for observability.', status: 'active', usedInSteps: 'All steps (continuous)', mitigatesRisks: 'Drift, Coordination Failure' },
  { label: 'LangGraph', description: 'Multi-step agent orchestration with state management and routing.', status: 'active', usedInSteps: 'Steps 2-6', mitigatesRisks: 'Agent Conflict' },
  { label: 'IAM', description: 'Least-privilege roles scoped per agent — cannot access beyond permitted tools.', status: 'active', usedInSteps: 'All steps', mitigatesRisks: 'Scope Exceedance, Blast Radius' },
  { label: 'KMS', description: 'Encryption at rest for all stored data using customer-managed keys.', status: 'active', usedInSteps: 'All steps (at rest)', mitigatesRisks: 'PII Leakage' },
  { label: 'CloudFront + WAF', description: 'Edge delivery, DDoS protection, and web application firewall rules.', status: 'active', usedInSteps: 'Edge (pre-Step 1)', mitigatesRisks: 'Injection, DDoS' },
];

/* Experimental services — coded but not yet in production */
export const experimentalServices: ArchItem[] = [
  { label: 'Bedrock Automated Reasoning', description: 'Cedar policies written for formal verification. Not yet deployed to production.', status: 'experimental', usedInSteps: 'Steps 3, 4 (planned)', mitigatesRisks: 'Hallucination' },
  { label: 'Amazon Verified Permissions', description: 'Cedar-based policy engine for fine-grained authorization. Deployed as AgentCore Gateway native engine with 18 Cedar forbid policies.', status: 'active', usedInSteps: 'Steps 4, 5', mitigatesRisks: 'Blast Radius, Scope Exceedance' },
  { label: 'AgentCore Evaluations', description: 'Custom evaluator framework ready, evaluators not yet connected to production pipeline.', status: 'experimental', usedInSteps: 'All steps (planned)', mitigatesRisks: 'Drift, Bias' },
  { label: 'Step Functions (HITL)', description: 'Human-in-the-loop workflow orchestration. Coded, deployment pending.', status: 'experimental', usedInSteps: 'Step 5 (planned)', mitigatesRisks: 'Blast Radius (high-value)' },
];

/* Probabilistic controls */
export const probabilisticControls: ArchItem[] = [
  { label: 'Guardrails (Input)', description: 'Scans incoming prompts for injection, toxicity, and off-topic content.', status: 'active', usedInSteps: 'Step 1', mitigatesRisks: 'Injection' },
  { label: 'Guardrails (Output)', description: 'Scans agent responses before delivery to catch policy violations.', status: 'active', usedInSteps: 'Step 7', mitigatesRisks: 'Hallucination, PII Leakage' },
  { label: 'Contextual Grounding', description: 'Verifies claims are grounded in retrieved source documents.', status: 'active', usedInSteps: 'Steps 3, 4', mitigatesRisks: 'Hallucination' },
  { label: 'LLM-as-Judge', description: 'Second LLM evaluates primary agent output for accuracy and faithfulness.', status: 'active', usedInSteps: 'Steps 4, 5', mitigatesRisks: 'Hallucination, Bias' },
];

/* Deterministic controls */
export const deterministicControls: ArchItem[] = [
  { label: 'Lambda Validators', description: 'Hard-coded checks: credit score ranges, sanctions list matching, schema validation.', status: 'active', usedInSteps: 'Steps 3, 4', mitigatesRisks: 'Hallucination, Missed Positives' },
  { label: 'IAM Roles', description: 'Each agent has minimal permissions — cannot call tools outside its scope.', status: 'active', usedInSteps: 'All steps', mitigatesRisks: 'Scope Exceedance' },
  { label: 'KMS Encryption', description: 'All data encrypted at rest; agent cannot access raw keys.', status: 'active', usedInSteps: 'All steps', mitigatesRisks: 'PII Leakage' },
  { label: 'WAF Rules', description: 'Web application firewall blocks malicious request patterns at the edge.', status: 'active', usedInSteps: 'Edge (pre-Step 1)', mitigatesRisks: 'Injection' },
  { label: 'DynamoDB Rate Limits', description: 'Per-agent throttling prevents runaway invocation loops.', status: 'active', usedInSteps: 'All steps', mitigatesRisks: 'Blast Radius' },
  { label: 'Gateway Interceptors', description: 'Pre/post hooks validate every API call before and after execution.', status: 'active', usedInSteps: 'Steps 1, 4, 5', mitigatesRisks: 'Blast Radius, Scope Exceedance' },
  { label: 'CloudWatch Alarms', description: 'Automated alerts on anomalous patterns trigger policy tightening.', status: 'active', usedInSteps: 'All steps (continuous)', mitigatesRisks: 'Drift' },
];

/* Legacy — keep for backward compat with old layout if needed */
export const defenceInDepth: ArchColumn[] = [
  { title: '\u26A0\uFE0F Probabilistic', titleColor: '#ff991f', items: ['\uD83D\uDEE1\uFE0F Guardrails (Input)', '\uD83D\uDEE1\uFE0F Guardrails (Output)', '\uD83D\uDD0D Contextual Grounding', '\u2696\uFE0F LLM-as-Judge'], note: '\u26A0\uFE0F AI-dependent \u2014 can produce false positives/negatives', noteColor: '#ff991f' },
  { title: '\u2713 Deterministic (Cannot Be Bypassed)', titleColor: '#0052CC', isPrimary: true, items: [], subGrid: [{ title: 'Lambda Validators', description: 'Hard-coded checks: sanctions, credit range, schema.' }, { title: 'Gateway Interceptors', description: 'Pre/post hooks validate every API call.' }, { title: 'IAM + KMS', description: 'Least-privilege roles, encryption at rest.' }, { title: 'CloudWatch Alarms', description: 'Anomaly detection triggers auto-tighten.' }], note: '\u2713 External to agent \u2014 cannot be overridden', noteColor: '#36b37e' },
  { title: '\uD83D\uDCCA Observability', titleColor: '#0052CC', items: ['\uD83D\uDCCA AgentCore Evaluations \u2697\uFE0F', '\uD83D\uDCC8 CloudWatch Metrics', '\uD83D\uDD0D X-Ray Distributed Tracing', '\uD83D\uDD12 CloudTrail Audit'], note: 'Feeds back to Policy Engine', noteColor: '#0052CC' },
];
