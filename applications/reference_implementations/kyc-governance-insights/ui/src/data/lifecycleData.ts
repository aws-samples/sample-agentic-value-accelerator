export interface LifecycleStep {
  icon: string;
  title: string;
  badge: string;
  badgeClass: string;
  description: string;
  risks: string[];
  controls: string[];
  hitl: string[];
}

export const lifecycleData: LifecycleStep[] = [
  { icon: '📥', title: 'Data Ingestion', badge: 'GenAI', badgeClass: 'b-genai', description: 'GenAI extracts data using Textract + Claude Sonnet 4.5 via AgentCore. Reasons about quality and completeness.', risks: ['Hallucinated content', 'Prompt injection', 'Missed forgery', 'PII in logs'], controls: ['Bedrock Guardrails', 'Amazon Textract (deterministic)', 'KMS + VPC isolation', 'CloudWatch logging'], hitl: ['Flags unclear docs', 'Manual for non-standard', 'Auto for standard IDs', 'Full provenance'] },
  { icon: '🤖', title: 'Identity Verification', badge: 'Deterministic', badgeClass: 'b-det', description: 'Deterministic Lambda functions validate hashes, cross-reference DBs, biometric liveness. Cannot hallucinate.', risks: ['Synthetic identity', 'DB availability', 'Cross-border residency', 'Biometric spoofing'], controls: ['Lambda (deterministic code)', 'Rekognition (liveness)', 'IAM least privilege', 'PrivateLink (regional)'], hitl: ['Auto-pass strong matches', 'Review partial matches', 'Block sanctioned IDs', 'Immutable audit'] },
  { icon: '🔍', title: 'Risk Scoring', badge: 'Agentic AI', badgeClass: 'b-genai', description: 'Agentic AI (Claude Sonnet 4.5) autonomously queries sanctions, PEP, adverse media via tools. Chain-of-thought reasoning.', risks: ['Hallucinated matches', 'Missed true positives', 'Data poisoning', 'Stale reference data'], controls: ['Automated Reasoning', 'Gateway Interceptors', 'Guardrails output scan', 'Parallel fuzzy match'], hitl: ['Score >60 → escalate', 'PEP → always analyst', 'Low-risk auto (earned)', 'Full audit trail'] },
  { icon: '📊', title: 'Credit Analysis', badge: 'GenAI+Rules', badgeClass: 'b-genai', description: 'Credit Analyst agent analyses financials. Lambda Worker independently recalculates all numbers. LLM-as-Judge reviews.', risks: ['Wrong calculations', 'Biased scoring', 'Manipulated financials', 'Outdated data'], controls: ['Lambda recalculation', 'LLM-as-Judge', 'RAI evaluator', 'AgentCore Evaluations'], hitl: ['>$50K → reviewed', 'Bias → mandatory', 'Auto within bounds', 'Quarterly recalibration'] },
  { icon: '⚖️', title: 'Compliance Gate', badge: 'Policy', badgeClass: 'b-policy', description: 'AgentCore Policy Engine enforces rules deterministically. 3 layers. LLM cannot bypass — external Lambda enforcement.', risks: ['Config errors', 'Reg changes missed', 'Circumvention attempts', 'Jurisdiction conflicts'], controls: ['3-layer Policy Engine', 'Gateway Interceptors', 'Compliance-as-Code', 'Automated Reasoning'], hitl: ['New regs → manual', 'Conflicts → board', 'Standard automated', 'Quarterly audit'] },
  { icon: '👤', title: 'Human Review', badge: 'HITL', badgeClass: 'b-hitl', description: 'Compliance Officer agent escalates to analyst when required. Structured briefing with reasoning chain and confidence.', risks: ['Analyst fatigue', 'Inconsistency', 'Incomplete explanation', 'Time pressure'], controls: ['Structured templates', 'Mandatory reasoning', 'Time escalation', 'Random QA (10%)'], hitl: ['Always for PEP', 'Score >60', 'Amount >$50K', 'Earned autonomy skip'] },
  { icon: '✅', title: 'Decision & Audit', badge: 'Audit', badgeClass: 'b-audit', description: 'Immutable record via CloudTrail + X-Ray. 6-dimension evaluation. DynamoDB state with auto-expiry. Drift → auto-tighten.', risks: ['Audit tampering', 'Model drift', 'Incomplete traces', 'Alert fatigue'], controls: ['CloudTrail + X-Ray', 'AgentCore Evaluations', 'Governance Dashboard', 'Auto policy tighten'], hitl: ['CRO dashboard', 'Quarterly reporting', 'Incident response', 'Annual validation'] },
];
