// ============================================================
// KYC Risk–Control–Service Mapping — Corrected & Exhaustive
// Drop-in replacement for riskControlMapping.ts
// ============================================================

export interface RiskItem {
  id: string;
  icon: string;
  label: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  regulatoryRef?: string; // e.g., "JMLSG §5.4.8"
}

export interface ControlItem {
  id: string;
  label: string;
  nature: 'deterministic' | 'probabilistic' | 'observability';
  description?: string;
}

export interface ServiceItem {
  id: string;
  label: string;
  icon: string;
}

export interface RiskControlLink {
  risk: RiskItem;
  controls: string[]; // control IDs
  services: string[]; // service IDs
  activeAtSteps: number[]; // step indices (0-6) where this risk is HIGHLIGHTED
  primaryAtSteps?: number[]; // steps where this is the FEATURED risk
}

// ──────────────────────────────────────────────────────────────
// RISKS → CONTROLS → SERVICES MAPPING
// ──────────────────────────────────────────────────────────────

export const riskControlMapping: RiskControlLink[] = [
  // ──── Step 0: Data Ingestion ────
  {
    risk: {
      id: 'injection-document',
      icon: '💉',
      label: 'Prompt Injection via Documents',
      description: 'Malicious instructions embedded in uploaded PDFs/images execute when parsed by LLM',
      severity: 'critical',
      regulatoryRef: 'FCA FCG 6.2.1',
    },
    controls: ['guardrails-input', 'waf-rules', 'vpc-isolation'],
    services: ['bedrock-guardrails', 'waf', 'cloudwatch'],
    activeAtSteps: [0, 1],
    primaryAtSteps: [0],
  },
  {
    risk: {
      id: 'data-exfiltration',
      icon: '🔓',
      label: 'Data Exfiltration',
      description: 'Sensitive PII/financial data leaked outside authorised boundaries during processing',
      severity: 'critical',
      regulatoryRef: 'GDPR Art. 32, FCA SYSC 6.1.1',
    },
    controls: ['vpc-isolation', 'kms-encryption', 'iam-least-privilege', 'gateway-interceptors'],
    services: ['vpc', 'kms', 'cloudwatch'],
    activeAtSteps: [0],
    primaryAtSteps: [0],
  },
  {
    risk: {
      id: 'ocr-error',
      icon: '📄',
      label: 'OCR Extraction Error',
      description: 'Textract misreads document fields leading to incorrect downstream data',
      severity: 'medium',
      regulatoryRef: 'JMLSG §5.3.1',
    },
    controls: ['lambda-validators', 'cloudwatch-alarms'],
    services: ['textract', 'lambda', 'cloudwatch'],
    activeAtSteps: [0],
    primaryAtSteps: [0],
  },
  {
    risk: {
      id: 'data-lineage-loss',
      icon: '🔗',
      label: 'Data Lineage Loss',
      description: 'Ingested data loses provenance metadata, making audit trail incomplete',
      severity: 'low',
      regulatoryRef: 'JMLSG §5.8, Basel §43',
    },
    controls: ['s3-object-lock', 'cloudwatch-alarms', 'lambda-validators'],
    services: ['s3', 'cloudwatch', 'lambda'],
    activeAtSteps: [0, 6],
    primaryAtSteps: [0],
  },

  // ──── Step 1: Identity Verification ────
  {
    risk: {
      id: 'document-forgery',
      icon: '🎭',
      label: 'Document Forgery / Deepfake',
      description: 'AI-generated synthetic identity documents pass automated verification checks',
      severity: 'critical',
      regulatoryRef: 'JMLSG §5.3.4, FCA FCG 3.2.4',
    },
    controls: ['contextual-grounding', 'lambda-validators', 'guardrails-input'],
    services: ['bedrock-guardrails', 'lambda', 'textract'],
    activeAtSteps: [1],
    primaryAtSteps: [1],
  },
  {
    risk: {
      id: 'ubo-misidentification',
      icon: '👥',
      label: 'UBO Misidentification',
      description: 'Agent incorrectly identifies or misses Ultimate Beneficial Owner in complex structures',
      severity: 'critical',
      regulatoryRef: 'JMLSG §5.4.8, Basel §21-23',
    },
    controls: ['lambda-validators', 'automated-reasoning', 'gateway-interceptors'],
    services: ['lambda', 'bedrock-ar', 'agentcore-gateway'],
    activeAtSteps: [1],
    primaryAtSteps: [1],
  },
  {
    risk: {
      id: 'data-source-manipulation',
      icon: '🔀',
      label: 'Data Source Manipulation',
      description: 'Compromised or spoofed external APIs (Companies House, credit bureaux) return false data',
      severity: 'high',
      regulatoryRef: 'FCA FCG 3.2.4',
    },
    controls: ['gateway-interceptors', 'verified-permissions-read', 'lambda-validators'],
    services: ['agentcore-gateway', 'verified-permissions', 'lambda'],
    activeAtSteps: [1, 2],
    primaryAtSteps: [1],
  },

  // ──── Step 2: Risk Scoring ────
  {
    risk: {
      id: 'sanctions-false-negative',
      icon: '⚠️',
      label: 'False Negative (Sanctions Miss)',
      description: 'Agent fails to match sanctioned entity due to name aliasing or fuzzy-match failure',
      severity: 'critical',
      regulatoryRef: 'Sanctions Act 2018, JMLSG §5.5, Wolfsberg Q7',
    },
    controls: ['lambda-validators', 'verified-permissions-tool-auth', 'cloudwatch-alarms'],
    services: ['lambda', 'verified-permissions', 'cloudwatch'],
    activeAtSteps: [2],
    primaryAtSteps: [2],
  },
  {
    risk: {
      id: 'false-positive-flooding',
      icon: '🚨',
      label: 'False Positive Flooding',
      description: 'Overly aggressive matching generates excessive alerts, desensitising reviewers',
      severity: 'medium',
      regulatoryRef: 'FCA FCG 3.2.1',
    },
    controls: ['llm-as-judge', 'contextual-grounding', 'lambda-validators'],
    services: ['bedrock', 'bedrock-guardrails', 'lambda'],
    activeAtSteps: [2],
    primaryAtSteps: [2],
  },
  {
    risk: {
      id: 'stale-screening-data',
      icon: '⏰',
      label: 'Stale Screening Data',
      description: 'Sanctions/PEP lists not updated, screening against outdated data',
      severity: 'critical',
      regulatoryRef: 'JMLSG §5.5.6, FCA FCG 3.2.1',
    },
    controls: ['dynamodb-ttl', 'cloudwatch-alarms', 'lambda-validators'],
    services: ['dynamodb', 'cloudwatch', 'lambda'],
    activeAtSteps: [2],
    primaryAtSteps: [2],
  },
  {
    risk: {
      id: 'geographic-risk-miscalc',
      icon: '🌍',
      label: 'Geographic Risk Miscalculation',
      description: 'Agent applies wrong jurisdiction risk weighting to entities',
      severity: 'medium',
      regulatoryRef: 'JMLSG §5.5.3, Basel §36',
    },
    controls: ['automated-reasoning', 'lambda-validators'],
    services: ['bedrock-ar', 'lambda'],
    activeAtSteps: [2],
  },

  // ──── Step 3: Credit Analysis ────
  {
    risk: {
      id: 'hallucination',
      icon: '🧠',
      label: 'Hallucination',
      description: 'LLM fabricates financial ratios, invents revenue figures, or cites non-existent filings',
      severity: 'critical',
      regulatoryRef: 'FCA Consumer Duty, FINOS AI Governance',
    },
    controls: ['automated-reasoning', 'llm-as-judge', 'contextual-grounding', 'lambda-validators'],
    services: ['bedrock-ar', 'bedrock', 'bedrock-guardrails', 'lambda'],
    activeAtSteps: [3, 6],
    primaryAtSteps: [3],
  },
  {
    risk: {
      id: 'algorithmic-bias',
      icon: '⚖️',
      label: 'Algorithmic Bias',
      description: 'Credit model systematically disadvantages protected characteristics',
      severity: 'critical',
      regulatoryRef: 'Equality Act 2010, FCA Consumer Duty, EU AI Act Art. 10',
    },
    controls: ['rai-evaluator', 'lambda-validators', 'continuous-eval'],
    services: ['agentcore-evaluations', 'lambda', 'cloudwatch'],
    activeAtSteps: [3],
    primaryAtSteps: [3],
  },
  {
    risk: {
      id: 'calculation-error',
      icon: '🔢',
      label: 'Calculation Error',
      description: 'Incorrect mathematical operations on financial statements (e.g., wrong DSCR formula)',
      severity: 'low',
      regulatoryRef: 'FCA MCOB, Basel §34',
    },
    controls: ['automated-reasoning', 'lambda-validators'],
    services: ['bedrock-ar', 'lambda'],
    activeAtSteps: [3],
    primaryAtSteps: [3],
  },
  {
    risk: {
      id: 'agent-conflict',
      icon: '🔀',
      label: 'Agent Conflict',
      description: 'Multiple sub-agents produce contradictory risk/credit assessments',
      severity: 'low',
      regulatoryRef: 'Internal control principle',
    },
    controls: ['arbiter', 'verified-permissions-tool-auth', 'gateway-interceptors'],
    services: ['agentcore-gateway', 'verified-permissions', 'agentcore'],
    activeAtSteps: [3, 4],
    primaryAtSteps: [3],
  },
  {
    risk: {
      id: 'unauthorised-data-access',
      icon: '🚫',
      label: 'Unauthorised Data Access',
      description: 'Agent accesses financial data beyond its authorised scope for the customer tier',
      severity: 'high',
      regulatoryRef: 'GDPR Art. 25, FCA SYSC 6.1.1',
    },
    controls: ['verified-permissions-tool-auth', 'gateway-interceptors', 'iam-least-privilege'],
    services: ['verified-permissions', 'agentcore-gateway', 'iam'],
    activeAtSteps: [3, 4],
    primaryAtSteps: [3],
  },

  // ──── Step 4: Compliance Gate ────
  {
    risk: {
      id: 'policy-bypass',
      icon: '🚧',
      label: 'Policy Bypass',
      description: 'Agent circumvents or fails to invoke the policy engine, proceeding without authorisation',
      severity: 'critical',
      regulatoryRef: 'FCA SYSC 6.3.1, JMLSG §5.6',
    },
    controls: ['verified-permissions-cedar', 'gateway-interceptors', 'iam-least-privilege'],
    services: ['verified-permissions', 'agentcore-gateway', 'iam'],
    activeAtSteps: [4],
    primaryAtSteps: [4],
  },
  {
    risk: {
      id: 'rule-staleness',
      icon: '📜',
      label: 'Rule Staleness',
      description: 'Cedar policies not updated to reflect latest regulatory changes',
      severity: 'high',
      regulatoryRef: 'FCA FCG 2.2, JMLSG §5.6',
    },
    controls: ['auto-tighten', 'continuous-eval', 'cloudwatch-alarms'],
    services: ['agentcore-evaluations', 'cloudwatch'],
    activeAtSteps: [4, 6],
    primaryAtSteps: [4],
  },
  {
    risk: {
      id: 'blast-radius',
      icon: '💥',
      label: 'Blast Radius',
      description: 'Policy engine incorrectly approves high-risk case or mass-escalates low-risk cases',
      severity: 'critical',
      regulatoryRef: 'Basel §14-15, FCA SYSC 6.3',
    },
    controls: ['verified-permissions-cedar', 'tier-limits', 'cloudwatch-alarms', 'gateway-interceptors'],
    services: ['verified-permissions', 'agentcore-gateway', 'cloudwatch'],
    activeAtSteps: [4, 5],
    primaryAtSteps: [4],
  },
  {
    risk: {
      id: 'config-drift',
      icon: '⚙️',
      label: 'Configuration Drift',
      description: 'Policy store diverges from intended state due to uncontrolled modifications',
      severity: 'medium',
      regulatoryRef: 'FCA SYSC 6.1, COBIT AI Governance',
    },
    controls: ['auto-tighten', 'iam-least-privilege', 'cloudwatch-alarms'],
    services: ['agentcore-evaluations', 'iam', 'cloudwatch'],
    activeAtSteps: [4],
  },

  // ──── Step 5: Human Oversight (HITL) ────
  {
    risk: {
      id: 'escalation-failure',
      icon: '📤',
      label: 'Escalation Failure',
      description: 'High-risk case not routed to human reviewer due to threshold misconfiguration',
      severity: 'critical',
      regulatoryRef: 'JMLSG §5.6.12, Basel §41',
    },
    controls: ['step-functions-hitl', 'tier-limits', 'verified-permissions-cedar'],
    services: ['step-functions', 'agentcore-gateway', 'verified-permissions'],
    activeAtSteps: [5],
    primaryAtSteps: [5],
  },
  {
    risk: {
      id: 'sla-breach',
      icon: '⏱️',
      label: 'SLA Breach',
      description: 'Human reviewer does not act within regulatory timeframe; case expires or stalls',
      severity: 'medium',
      regulatoryRef: 'MLR 2017 Reg. 30A, FCA FCG 3.2.7',
    },
    controls: ['step-functions-hitl', 'cloudwatch-alarms', 'sns-notifications'],
    services: ['step-functions', 'cloudwatch', 'sns-ses'],
    activeAtSteps: [5],
    primaryAtSteps: [5],
  },
  {
    risk: {
      id: 'reviewer-bias',
      icon: '👁️',
      label: 'Reviewer Bias / Rubber-Stamping',
      description: 'Human approver develops confirmation bias or habitually approves without scrutiny',
      severity: 'medium',
      regulatoryRef: 'FCA FCG 2.1, Basel §41',
    },
    controls: ['continuous-eval', 'rai-evaluator', 'cloudwatch-alarms'],
    services: ['agentcore-evaluations', 'cloudwatch'],
    activeAtSteps: [5],
    primaryAtSteps: [5],
  },
  {
    risk: {
      id: 'token-manipulation',
      icon: '🎟️',
      label: 'Token Manipulation',
      description: 'TaskToken intercepted or replayed to forge approval without genuine human review',
      severity: 'critical',
      regulatoryRef: 'FCA SYSC 6.1.1, Cyber security principles',
    },
    controls: ['verified-permissions-reviewer', 'iam-least-privilege', 'kms-encryption'],
    services: ['verified-permissions', 'iam', 'kms', 'step-functions'],
    activeAtSteps: [5],
    primaryAtSteps: [5],
  },

  // ──── Step 6: Decision & Audit ────
  {
    risk: {
      id: 'audit-trail-incomplete',
      icon: '📋',
      label: 'Audit Trail Incompleteness',
      description: 'Decision rationale not fully captured, failing regulatory reconstruction requirements',
      severity: 'low',
      regulatoryRef: 'JMLSG §5.8, MLR 2017 Reg. 40, Basel §43',
    },
    controls: ['cloudwatch-alarms', 'llm-as-judge', 'kms-encryption', 'lambda-validators'],
    services: ['cloudwatch', 'bedrock', 'kms', 's3', 'lambda'],
    activeAtSteps: [6],
    primaryAtSteps: [6],
  },
  {
    risk: {
      id: 'sar-filing-error',
      icon: '📝',
      label: 'SAR Filing Error',
      description: 'Suspicious Activity Report contains hallucinated details or omits material facts',
      severity: 'critical',
      regulatoryRef: 'POCA 2002 §330, FCA FCG 3.3',
    },
    controls: ['automated-reasoning', 'llm-as-judge', 'lambda-validators'],
    services: ['bedrock-ar', 'bedrock', 'lambda'],
    activeAtSteps: [6],
    primaryAtSteps: [6],
  },
  {
    risk: {
      id: 'model-drift',
      icon: '📉',
      label: 'Model Drift (Silent Degradation)',
      description: 'Agent quality degrades over time without detection; past decisions become questionable',
      severity: 'high',
      regulatoryRef: 'FCA FCG 2.2, FINOS AI Governance',
    },
    controls: ['continuous-eval', 'auto-tighten', 'cloudwatch-alarms'],
    services: ['agentcore-evaluations', 'cloudwatch'],
    activeAtSteps: [6],
    primaryAtSteps: [6],
  },
  {
    risk: {
      id: 'data-retention-violation',
      icon: '🗂️',
      label: 'Data Retention Violation',
      description: 'Records retained beyond/before statutory periods (GDPR vs AML 5-year conflict)',
      severity: 'high',
      regulatoryRef: 'GDPR Art. 17, MLR 2017 Reg. 40',
    },
    controls: ['dynamodb-ttl', 'lambda-validators', 's3-object-lock'],
    services: ['dynamodb', 'lambda', 's3'],
    activeAtSteps: [6],
    primaryAtSteps: [6],
  },
  {
    risk: {
      id: 'decision-inconsistency',
      icon: '🎲',
      label: 'Decision Inconsistency',
      description: 'Similar cases receive materially different outcomes without justification',
      severity: 'high',
      regulatoryRef: 'FCA Consumer Duty, Equality Act 2010',
    },
    controls: ['continuous-eval', 'lambda-validators', 'llm-as-judge'],
    services: ['agentcore-evaluations', 'lambda', 'bedrock'],
    activeAtSteps: [6],
    primaryAtSteps: [6],
  },
];

// ──────────────────────────────────────────────────────────────
// CONTROLS REGISTRY
// ──────────────────────────────────────────────────────────────

export const controls: ControlItem[] = [
  // Deterministic controls
  { id: 'guardrails-input', label: 'Guardrails (Input)', nature: 'deterministic', description: 'Pre-invocation content filtering via Bedrock Guardrails' },
  { id: 'guardrails-output', label: 'Guardrails (Output)', nature: 'deterministic', description: 'Post-invocation content filtering via Bedrock Guardrails' },
  { id: 'automated-reasoning', label: 'Automated Reasoning', nature: 'deterministic', description: 'Mathematical/logical proof verification of agent outputs' },
  { id: 'verified-permissions-cedar', label: 'Verified Permissions (Cedar Policies)', nature: 'deterministic', description: 'Cedar policy evaluation — runtime authorization gate before every tool call' },
  { id: 'verified-permissions-read', label: 'Verified Permissions (Read Scope)', nature: 'deterministic', description: 'Cedar policy scoping external API access to read-only' },
  { id: 'verified-permissions-tool-auth', label: 'Verified Permissions (Tool Auth)', nature: 'deterministic', description: 'Cedar policy ensuring agent calls mandatory tools (e.g., sanctions API)' },
  { id: 'verified-permissions-reviewer', label: 'Verified Permissions (Reviewer Auth)', nature: 'deterministic', description: 'Cedar policy restricting approval actions to designated reviewers' },
  { id: 'step-functions-hitl', label: 'Step Functions HITL', nature: 'deterministic', description: 'TaskToken callback pattern with SLA-driven escalation timers' },
  { id: 'gateway-interceptors', label: 'Gateway Interceptors', nature: 'deterministic', description: 'AgentCore Gateway pre/post tool-call interception' },
  { id: 'tier-limits', label: 'Tier Limits', nature: 'deterministic', description: 'Transaction/decision limits by customer risk tier' },
  { id: 'lambda-validators', label: 'Lambda Validators', nature: 'deterministic', description: 'Deterministic validation logic (schema, calculations, cross-checks)' },
  { id: 'auto-tighten', label: 'Auto-Tighten Policy', nature: 'deterministic', description: 'Automatic policy restriction when evaluation scores drift below threshold' },
  { id: 'iam-least-privilege', label: 'IAM Least Privilege', nature: 'deterministic', description: 'AWS IAM roles scoped to minimum required permissions' },
  { id: 'kms-encryption', label: 'KMS Encryption', nature: 'deterministic', description: 'Data-at-rest and data-in-transit encryption with AWS KMS' },
  { id: 'vpc-isolation', label: 'VPC Isolation', nature: 'deterministic', description: 'Network-level isolation preventing data egress' },
  { id: 'waf-rules', label: 'WAF Rules', nature: 'deterministic', description: 'Web application firewall rules blocking malicious payloads' },
  { id: 'dynamodb-ttl', label: 'DynamoDB TTL', nature: 'deterministic', description: 'Automatic data expiry for cache freshness and retention compliance' },
  { id: 's3-object-lock', label: 'S3 Object Lock & Versioning', nature: 'deterministic', description: 'Immutable document storage for regulatory record-keeping' },
  { id: 'sns-notifications', label: 'SNS/SES Notifications', nature: 'deterministic', description: 'Reviewer notification delivery for HITL workflows' },

  // Probabilistic controls
  { id: 'contextual-grounding', label: 'Contextual Grounding', nature: 'probabilistic', description: 'Guardrails grounding check against source documents' },
  { id: 'llm-as-judge', label: 'LLM-as-Judge', nature: 'probabilistic', description: 'Secondary LLM evaluating primary output for accuracy/completeness' },
  { id: 'rai-evaluator', label: 'RAI Evaluator', nature: 'probabilistic', description: 'Responsible AI evaluator for bias, fairness, toxicity detection' },
  { id: 'arbiter', label: 'Arbiter / Supervisor', nature: 'probabilistic', description: 'Multi-agent conflict resolution via supervisor pattern' },

  // Observability controls
  { id: 'continuous-eval', label: 'Continuous Evaluation', nature: 'observability', description: 'AgentCore Evaluations: 6+ dimension scoring on sampled production traffic' },
  { id: 'cloudwatch-alarms', label: 'CloudWatch Alarms', nature: 'observability', description: 'Metric-based alerting for SLA, drift, anomaly detection' },
];

// ──────────────────────────────────────────────────────────────
// SERVICES REGISTRY
// ──────────────────────────────────────────────────────────────

export const services: ServiceItem[] = [
  // Core AI/ML
  { id: 'bedrock', label: 'Amazon Bedrock', icon: '🤖' },
  { id: 'bedrock-ar', label: 'Bedrock Automated Reasoning', icon: '🧮' },
  { id: 'bedrock-guardrails', label: 'Bedrock Guardrails', icon: '🛡️' },

  // AgentCore stack
  { id: 'agentcore', label: 'Amazon Bedrock AgentCore', icon: '⚙️' },
  { id: 'agentcore-gateway', label: 'AgentCore Gateway', icon: '🚪' },
  { id: 'agentcore-evaluations', label: 'AgentCore Evaluations', icon: '📊' },

  // Governance trio (LIVE)
  { id: 'verified-permissions', label: 'Amazon Verified Permissions', icon: '🔐' },
  { id: 'step-functions', label: 'AWS Step Functions', icon: '🔄' },

  // Compute & logic
  { id: 'lambda', label: 'AWS Lambda', icon: '⚡' },
  { id: 'textract', label: 'Amazon Textract', icon: '📑' },

  // Data & storage
  { id: 'dynamodb', label: 'Amazon DynamoDB', icon: '🗄️' },
  { id: 's3', label: 'Amazon S3', icon: '📦' },

  // Security & networking
  { id: 'iam', label: 'AWS IAM', icon: '🔑' },
  { id: 'kms', label: 'AWS KMS', icon: '🔒' },
  { id: 'vpc', label: 'Amazon VPC', icon: '🏰' },
  { id: 'waf', label: 'AWS WAF', icon: '🧱' },

  // Observability & notifications
  { id: 'cloudwatch', label: 'Amazon CloudWatch', icon: '📈' },
  { id: 'sns-ses', label: 'Amazon SNS/SES', icon: '📬' },
];

// ──────────────────────────────────────────────────────────────
// HELPER: Get active items for a specific step
// ──────────────────────────────────────────────────────────────

export function getActiveRisksForStep(step: number): RiskControlLink[] {
  return riskControlMapping.filter(r => r.activeAtSteps.includes(step));
}

export function getPrimaryRisksForStep(step: number): RiskControlLink[] {
  return riskControlMapping.filter(r => r.primaryAtSteps?.includes(step));
}

export function getActiveControlIdsForStep(step: number): string[] {
  const risks = getActiveRisksForStep(step);
  return [...new Set(risks.flatMap(r => r.controls))];
}

export function getActiveServiceIdsForStep(step: number): string[] {
  const risks = getActiveRisksForStep(step);
  return [...new Set(risks.flatMap(r => r.services))];
}

// ──────────────────────────────────────────────────────────────
// STEP METADATA (for panel headers)
// ──────────────────────────────────────────────────────────────

export const stepMetadata = [
  { index: 0, label: 'Data Ingestion', primaryService: 'textract', description: 'Documents uploaded, OCR\'d, structured' },
  { index: 1, label: 'Identity Verification', primaryService: 'agentcore-gateway', description: 'UBO identification, Companies House checks, document authenticity' },
  { index: 2, label: 'Risk Scoring', primaryService: 'verified-permissions', description: 'Sanctions screening, PEP checks, adverse media, geographic risk' },
  { index: 3, label: 'Credit Analysis', primaryService: 'bedrock-ar', description: 'Financial ratio calculation, credit scoring, affordability' },
  { index: 4, label: 'Compliance Gate', primaryService: 'verified-permissions', description: 'Policy engine evaluation, regulatory rule checking (Cedar)' },
  { index: 5, label: 'Human Oversight', primaryService: 'step-functions', description: 'Step Functions HITL workflow, mandatory review for high-risk cases' },
  { index: 6, label: 'Decision & Audit', primaryService: 'agentcore-evaluations', description: 'Final decision, audit trail, SAR filing, evaluation scoring' },
];

// ──────────────────────────────────────────────────────────────
// DETAIL PANEL DATA — enriched info for click-to-inspect
// ──────────────────────────────────────────────────────────────

export interface ServiceDetail {
  description: string;
  whatItDoes: string;
  thresholds: string;
  status: 'LIVE' | 'SIMULATED';
  configuration: string;
}

export interface ControlDetail {
  whatItCatches: string;
  kpiMetric: string;
  lastTriggered: string;
}

export interface RiskDetail {
  businessDescription: string;
  kpiMetric: string;
  regulatoryRef: string;
}

export const serviceDetails: Record<string, ServiceDetail> = {
  'bedrock': {
    description: 'Provides the core AI reasoning capability that powers agent decision-making.',
    whatItDoes: 'Amazon Bedrock hosts the foundation models (Claude) that analyse customer documents, assess risk, and generate compliance narratives. It handles all natural-language understanding and generation tasks in the KYC pipeline.',
    thresholds: 'Max tokens: 4096 per invocation | Temperature: 0.1 (low creativity) | Timeout: 30s | Rate limit: 100 req/min per agent',
    status: 'LIVE',
    configuration: 'Model: Claude 3.5 Sonnet via cross-region inference. Guardrails attached to every invocation. System prompts locked via version control.',
  },
  'bedrock-ar': {
    description: 'Mathematically proves that agent outputs follow the rules — no guessing involved.',
    whatItDoes: 'Bedrock Automated Reasoning uses Cedar policy language to formally verify agent decisions. If an agent says "approve this customer", AR checks the logical proof chain against regulatory rules before allowing the decision through.',
    thresholds: 'Policy evaluation timeout: 500ms | Max policy size: 10KB | Proof depth: 5 levels | Denial default: DENY if proof incomplete',
    status: 'LIVE',
    configuration: 'Cedar policy store synced from version-controlled repository. Policies cover: credit limits, jurisdiction rules, sanctions thresholds, UBO ownership chains.',
  },
  'bedrock-guardrails': {
    description: 'Filters harmful content and protects sensitive data flowing through the system.',
    whatItDoes: 'Bedrock Guardrails scans every prompt and response for injection attacks, personally identifiable information, and off-topic content. It blocks harmful requests before they reach the model and redacts sensitive data from responses.',
    thresholds: 'PII detection: blocks SSN, IBAN, sort codes, passport numbers | Prompt injection: HIGH sensitivity | Denied topics: financial advice, legal advice, political opinion | Toxicity: MEDIUM threshold',
    status: 'LIVE',
    configuration: 'Guardrail v3 with content filters, PII redaction (detect+block), grounding check enabled (0.7 threshold), custom word filters for internal project names.',
  },
  'agentcore': {
    description: 'Manages the lifecycle of all AI agents — deployment, versioning, and runtime orchestration.',
    whatItDoes: 'AgentCore handles agent registration, version management, and runtime orchestration. It ensures agents are deployed consistently, tracks which version is live, and manages the handoff between multiple agents in a workflow.',
    thresholds: 'Max concurrent agents: 10 | Agent timeout: 120s | Memory limit: 512MB per session | Max tool calls per turn: 15',
    status: 'LIVE',
    configuration: 'Three registered agents: Credit Analyst, Compliance Officer, Document Verifier. Blue/green deployment with automatic rollback on error spike.',
  },
  'agentcore-gateway': {
    description: 'The single entry point that authenticates, routes, and rate-limits all agent requests.',
    whatItDoes: 'AgentCore Gateway sits between clients and agents, enforcing authentication, applying rate limits, and routing requests to the correct agent version. It intercepts every tool call for policy checking before execution.',
    thresholds: 'Rate limit: 1000 req/min global | Per-customer: 50 req/min | Payload max: 1MB | Auth token expiry: 15min',
    status: 'LIVE',
    configuration: 'mTLS required for all connections. Request/response logging to CloudWatch. Pre/post interceptors for Verified Permissions checks.',
  },
  'agentcore-evaluations': {
    description: 'Continuously scores agent quality across multiple dimensions to catch degradation early.',
    whatItDoes: 'AgentCore Evaluations samples production traffic and scores agent responses on accuracy, faithfulness, safety, groundedness, helpfulness, and task completion. Scores below threshold trigger automatic policy tightening.',
    thresholds: 'Sample rate: 10% of production traffic | Accuracy threshold: 92% | Faithfulness threshold: 90% | Auto-tighten trigger: any dimension < 85%',
    status: 'LIVE',
    configuration: '6-dimension evaluation framework. Scores published to CloudWatch. 8-week rolling window for trend detection. Alert on 3 consecutive days below threshold.',
  },
  'verified-permissions': {
    description: 'Makes yes/no authorization decisions using formally verifiable policy rules.',
    whatItDoes: 'Amazon Verified Permissions evaluates Cedar policies to determine whether an agent action is permitted. Every tool call, data access, and decision flows through VP for authorization — ensuring agents can only do what policy explicitly allows.',
    thresholds: 'Policy evaluation: < 10ms p99 | Max policies per store: 1000 | Default decision: DENY | Audit log: every evaluation',
    status: 'LIVE',
    configuration: 'Cedar policies organized by domain: credit-limits, sanctions-screening, data-access, reviewer-assignment. Schema enforces entity types.',
  },
  'step-functions': {
    description: 'Orchestrates human review workflows with built-in escalation timers.',
    whatItDoes: 'Step Functions manages the human-in-the-loop workflow using TaskToken callbacks. When a case needs human review, it pauses execution, notifies the reviewer, and enforces SLA timers — automatically escalating if no response within the deadline.',
    thresholds: 'SLA timer: 4 hours (high-risk), 24 hours (medium-risk) | Auto-escalation: after 1 missed SLA | Max queue depth: 500 cases',
    status: 'LIVE',
    configuration: 'Three workflow variants by risk tier. Escalation chain: L1 reviewer → L2 senior → MLRO. TaskToken cryptographically bound to reviewer identity.',
  },
  'lambda': {
    description: 'Runs deterministic validation logic that doesn\'t need AI — just precise calculations.',
    whatItDoes: 'Lambda functions handle tasks where precision matters more than reasoning: sanctions list matching, financial ratio calculations, schema validation, and cross-reference checks. These are the "hard rules" that complement the AI\'s "soft reasoning".',
    thresholds: 'Execution timeout: 30s | Memory: 256MB | Concurrency: 100 | Cold start budget: 3s',
    status: 'LIVE',
    configuration: '12 validator functions deployed: sanctions-matcher, dscr-calculator, schema-validator, cross-ref-checker, ubo-chain-validator, etc.',
  },
  'textract': {
    description: 'Reads and understands documents — turning PDFs and images into structured data.',
    whatItDoes: 'Amazon Textract extracts text, tables, and key-value pairs from uploaded documents (passports, bank statements, company filings). It provides confidence scores for each extraction, flagging low-confidence fields for human review.',
    thresholds: 'Confidence threshold: 95% (below = flagged for review) | Max document size: 10MB | Supported formats: PDF, PNG, JPEG, TIFF | Max pages: 50',
    status: 'LIVE',
    configuration: 'Custom adapter for UK identity documents. Table extraction enabled for financial statements. Confidence scores passed downstream for quality gating.',
  },
  'dynamodb': {
    description: 'Fast database for screening results and session data with automatic expiry.',
    whatItDoes: 'DynamoDB stores transient screening results, agent session state, and cached external API responses. TTL ensures data doesn\'t persist beyond its useful life, supporting both performance (fast lookups) and compliance (retention limits).',
    thresholds: 'Read capacity: 1000 RCU | Write capacity: 500 WCU | TTL: 24h for cache, 90 days for decisions | Point-in-time recovery: enabled',
    status: 'LIVE',
    configuration: 'Three tables: screening-cache (24h TTL), decision-log (5yr retention), session-state (1h TTL). GSI on customer-id and decision-date.',
  },
  's3': {
    description: 'Permanent, tamper-proof storage for documents and audit records.',
    whatItDoes: 'S3 provides immutable storage for original customer documents and decision audit trails. Object Lock prevents modification or deletion, ensuring regulatory reconstruction requirements are met for the mandatory 5-year retention period.',
    thresholds: 'Object Lock: GOVERNANCE mode, 5-year retention | Versioning: enabled | Max object size: 5GB | Encryption: SSE-KMS',
    status: 'LIVE',
    configuration: 'Two buckets: documents-ingest (lifecycle to Glacier after 90d), audit-trail (Object Lock, no lifecycle). Cross-region replication enabled.',
  },
  'iam': {
    description: 'Ensures every component can only access exactly what it needs — nothing more.',
    whatItDoes: 'IAM enforces least-privilege access across all agents, Lambda functions, and services. Each component has a narrowly scoped role that permits only its specific operations, preventing lateral movement if any single component is compromised.',
    thresholds: 'Max policy size: 6KB | Permission boundary: mandatory | Session duration: 1h | MFA: required for human access',
    status: 'LIVE',
    configuration: 'Service-linked roles per Lambda function. Permission boundaries prevent privilege escalation. SCPs at OU level block dangerous actions.',
  },
  'kms': {
    description: 'Manages encryption keys so sensitive data is protected everywhere it goes.',
    whatItDoes: 'KMS provides centralized key management for encrypting customer data at rest (S3, DynamoDB) and in transit. Automatic key rotation ensures long-term security without operational overhead.',
    thresholds: 'Key rotation: every 365 days (automatic) | API rate limit: 5500 req/s | Key policy: deny plaintext export',
    status: 'LIVE',
    configuration: 'Customer-managed CMK per data classification tier. Separate keys for PII, financial data, and audit logs. CloudTrail logging of all key usage.',
  },
  'vpc': {
    description: 'Network isolation that prevents data from leaving the secure environment.',
    whatItDoes: 'VPC provides network-level isolation for all backend compute. Private subnets have no internet access, and all external communication flows through controlled VPC endpoints — ensuring sensitive data cannot be exfiltrated via network channels.',
    thresholds: 'Subnets: 3 private, 0 public | NAT: none (VPC endpoints only) | Flow logs: enabled | Security groups: deny-all default',
    status: 'LIVE',
    configuration: 'Interface endpoints for Bedrock, DynamoDB, S3, KMS, CloudWatch. No internet gateway. Flow logs shipped to security SIEM.',
  },
  'waf': {
    description: 'Blocks malicious requests at the edge before they reach the application.',
    whatItDoes: 'WAF applies rule sets at the API Gateway level to block common attacks: SQL injection, cross-site scripting, known-bad IPs, and rate-limit abuse. It provides the first line of defence for the public-facing API.',
    thresholds: 'Rate limit: 2000 req/5min per IP | Managed rules: AWSManagedRulesCommonRuleSet | Geo-restriction: UK, EU only | Bot control: enabled',
    status: 'LIVE',
    configuration: 'Three rule groups: AWS managed common, rate-based, custom (KYC-specific payload patterns). Logging to S3 for security review.',
  },
  'cloudwatch': {
    description: 'Monitors everything and alerts when something goes wrong.',
    whatItDoes: 'CloudWatch collects metrics, logs, and traces from every component. Alarms fire when error rates spike, latency exceeds thresholds, or cost anomalies appear — enabling rapid response to governance incidents.',
    thresholds: 'Alarm evaluation: 1-minute periods | Error rate alarm: > 1% for 3 periods | Latency alarm: p95 > 5s | Cost anomaly: > 20% daily variance',
    status: 'LIVE',
    configuration: 'Custom dashboard for governance metrics. Log Insights queries for audit search. X-Ray tracing on all agent invocations. Metric filters for regulatory events.',
  },
  'sns-ses': {
    description: 'Delivers notifications to human reviewers when their attention is needed.',
    whatItDoes: 'SNS/SES sends alerts to human reviewers for HITL cases, escalation notifications, and SLA warnings. It ensures the right person is notified at the right time with the right context to make informed decisions.',
    thresholds: 'Delivery: < 5s for SMS, < 30s for email | Retry: 3 attempts | DLQ: enabled | Rate limit: 100 messages/s',
    status: 'LIVE',
    configuration: 'Topic per reviewer tier. Email templates for case summary. SMS for urgent escalations. Delivery status tracking enabled.',
  },
};

export const controlDetails: Record<string, ControlDetail> = {
  'guardrails-input': {
    whatItCatches: 'Prompt injection attempts ("ignore previous instructions"), embedded malicious code in documents, PII in user prompts (SSN, IBAN, sort codes), off-topic requests (financial advice, legal guidance)',
    kpiMetric: 'policyTriggerRate',
    lastTriggered: '2026-06-24T14:32:00Z — blocked prompt injection attempt in uploaded PDF metadata',
  },
  'guardrails-output': {
    whatItCatches: 'Hallucinated financial figures in responses, PII leakage in agent output, toxic or biased language, off-topic content generation',
    kpiMetric: 'falsePositiveRate',
    lastTriggered: '2026-06-24T11:15:00Z — redacted customer account number from agent response',
  },
  'automated-reasoning': {
    whatItCatches: 'Logically invalid credit decisions, policy violations in approval logic, incorrect ownership chain calculations, regulatory rule breaches',
    kpiMetric: 'evalScoreTrend',
    lastTriggered: '2026-06-24T16:45:00Z — rejected approval where DSCR calculation violated policy minimum',
  },
  'verified-permissions-cedar': {
    whatItCatches: 'Unauthorized agent actions, attempts to bypass policy gates, actions exceeding role scope, missing mandatory checks',
    kpiMetric: 'policyTriggerRate',
    lastTriggered: '2026-06-24T09:22:00Z — denied agent attempt to skip sanctions screening step',
  },
  'verified-permissions-read': {
    whatItCatches: 'Write attempts to external APIs, data modification outside read scope, unauthorized PUT/POST/DELETE to partner systems',
    kpiMetric: 'policyTriggerRate',
    lastTriggered: '2026-06-23T17:40:00Z — blocked write attempt to Companies House API',
  },
  'verified-permissions-tool-auth': {
    whatItCatches: 'Skipped mandatory tool calls (sanctions API, credit bureau), attempts to proceed without required checks, tool call ordering violations',
    kpiMetric: 'falseNegativeRate',
    lastTriggered: '2026-06-24T13:10:00Z — enforced mandatory sanctions check before risk scoring',
  },
  'verified-permissions-reviewer': {
    whatItCatches: 'Unauthorized approval attempts, non-designated reviewer trying to approve, expired delegation tokens, role boundary violations',
    kpiMetric: 'overrideRate',
    lastTriggered: '2026-06-24T10:55:00Z — rejected approval from L1 reviewer for high-risk case requiring L2',
  },
  'step-functions-hitl': {
    whatItCatches: 'Cases exceeding SLA without action, stuck workflows, missing reviewer assignments, escalation chain failures',
    kpiMetric: 'meanTimeToEscalation',
    lastTriggered: '2026-06-24T15:20:00Z — auto-escalated case after 4-hour SLA breach',
  },
  'gateway-interceptors': {
    whatItCatches: 'Malformed API requests, authentication failures, rate limit violations, payload size overruns, unauthorized agent versions',
    kpiMetric: 'policyTriggerRate',
    lastTriggered: '2026-06-24T12:00:00Z — rejected request exceeding 1MB payload limit',
  },
  'tier-limits': {
    whatItCatches: 'Decisions exceeding customer tier exposure limits, transaction amounts above threshold, batch sizes exceeding policy, auto-approval on high-value cases',
    kpiMetric: 'escalationRate',
    lastTriggered: '2026-06-24T14:55:00Z — escalated £2.1M facility to L2 (exceeds Tier 2 auto-approval limit)',
  },
  'llm-as-judge': {
    whatItCatches: 'Factual inaccuracies in agent output, unsupported claims, incomplete analysis, missing key risk factors, contradictory statements',
    kpiMetric: 'agentAgreementRate',
    lastTriggered: '2026-06-24T16:10:00Z — flagged credit analysis that omitted material adverse finding',
  },
  'lambda-validators': {
    whatItCatches: 'Calculation errors (DSCR, LTV), schema violations in data payloads, sanctions list format mismatches, date/currency format errors',
    kpiMetric: 'evalScoreTrend',
    lastTriggered: '2026-06-24T11:40:00Z — caught incorrect DSCR formula application on multi-entity filing',
  },
  'continuous-eval': {
    whatItCatches: 'Gradual model drift, accuracy degradation over time, fairness metric changes, emerging bias patterns, seasonal performance shifts',
    kpiMetric: 'evalScoreTrend',
    lastTriggered: '2026-06-24T08:00:00Z — daily evaluation cycle completed, all dimensions green',
  },
  'auto-tighten': {
    whatItCatches: 'Evaluation scores dropping below threshold, sustained performance degradation, post-incident recovery confirmation, policy store staleness',
    kpiMetric: 'evalScoreTrend',
    lastTriggered: '2026-06-20T14:30:00Z — activated after accuracy dropped below 88% for 2 consecutive days',
  },
  'rai-evaluator': {
    whatItCatches: 'Bias across protected attributes (age, gender, ethnicity), disproportionate denial rates, discriminatory language patterns, fairness metric violations',
    kpiMetric: 'evalScoreTrend',
    lastTriggered: '2026-06-22T09:15:00Z — flagged 12% higher denial rate for applicants in specific postcode cluster',
  },
  'arbiter': {
    whatItCatches: 'Contradictory assessments between agents, deadlocked multi-agent decisions, inconsistent risk ratings across sub-agents, priority conflicts',
    kpiMetric: 'agentAgreementRate',
    lastTriggered: '2026-06-24T13:45:00Z — resolved conflict between Credit Analyst (approve) and Compliance Officer (escalate)',
  },
  'iam-least-privilege': {
    whatItCatches: 'Over-privileged role assumptions, cross-boundary access attempts, privilege escalation patterns, unused permission accumulation',
    kpiMetric: 'policyTriggerRate',
    lastTriggered: '2026-06-23T22:10:00Z — access analyzer flagged unused s3:PutObject permission on validator role',
  },
  'kms-encryption': {
    whatItCatches: 'Unencrypted data writes, key policy violations, unauthorized decrypt attempts, expired key usage, cross-account key access',
    kpiMetric: 'breachCount',
    lastTriggered: '2026-06-21T06:00:00Z — automatic key rotation completed successfully',
  },
  'vpc-isolation': {
    whatItCatches: 'Outbound connection attempts to internet, DNS exfiltration, unauthorized cross-VPC traffic, security group modifications',
    kpiMetric: 'breachCount',
    lastTriggered: '2026-06-19T03:22:00Z — blocked outbound DNS query to non-approved resolver',
  },
  'waf-rules': {
    whatItCatches: 'SQL injection payloads, XSS attempts, known-bad IP requests, rate limit abuse, geo-restricted access attempts, bot traffic',
    kpiMetric: 'policyTriggerRate',
    lastTriggered: '2026-06-24T08:45:00Z — rate-limited IP after 2000 requests in 5 minutes',
  },
  'cloudwatch-alarms': {
    whatItCatches: 'Error rate spikes, latency threshold breaches, cost anomalies, metric gaps (missing data), capacity warnings',
    kpiMetric: 'breachCount',
    lastTriggered: '2026-06-24T07:30:00Z — alarm cleared: p95 latency returned below 5s threshold',
  },
  'dynamodb-ttl': {
    whatItCatches: 'Expired cache entries still being served, retention period violations, orphaned session data, stale screening results beyond freshness window',
    kpiMetric: 'policyTriggerRate',
    lastTriggered: '2026-06-24T00:00:00Z — 847 expired screening cache entries auto-deleted',
  },
  's3-object-lock': {
    whatItCatches: 'Deletion attempts on protected documents, modification of audit records, retention policy bypass attempts, early lifecycle transitions',
    kpiMetric: 'breachCount',
    lastTriggered: '2026-06-22T11:00:00Z — denied delete request on document within 5-year retention lock',
  },
  'sns-notifications': {
    whatItCatches: 'Failed notification deliveries, bounced emails, reviewer not acknowledging, delivery timeouts exceeding SLA',
    kpiMetric: 'meanTimeToEscalation',
    lastTriggered: '2026-06-24T15:22:00Z — delivered escalation notification to MLRO after L2 SLA breach',
  },
  'contextual-grounding': {
    whatItCatches: 'Claims not supported by source documents, fabricated references, misquoted figures, statements contradicting retrieved evidence',
    kpiMetric: 'evalScoreTrend',
    lastTriggered: '2026-06-24T14:05:00Z — flagged revenue claim not found in submitted financial statements',
  },
};

export const riskDetails: Record<string, RiskDetail> = {
  'injection-document': {
    businessDescription: 'A malicious actor embeds hidden instructions in a document (PDF, image) that trick the AI into performing unauthorized actions when it reads the document. This could lead to data theft, unauthorized approvals, or system manipulation.',
    kpiMetric: 'policyTriggerRate',
    regulatoryRef: 'FCA FCG 6.2.1 — Firms must have systems and controls to detect and prevent fraud in electronic channels',
  },
  'data-exfiltration': {
    businessDescription: 'Sensitive customer information (passport details, financial records, addresses) could leak outside the secure system boundary — whether through a compromised agent, logging misconfiguration, or network gap.',
    kpiMetric: 'breachCount',
    regulatoryRef: 'GDPR Article 32 — Appropriate technical measures to ensure security; FCA SYSC 6.1.1 — Effective systems and controls',
  },
  'ocr-error': {
    businessDescription: 'The document reader misinterprets characters (e.g., reading "1" as "7" in a passport number) leading to incorrect identity checks or financial calculations downstream.',
    kpiMetric: 'evalScoreTrend',
    regulatoryRef: 'JMLSG §5.3.1 — Firms should verify customer identity information from reliable sources',
  },
  'data-lineage-loss': {
    businessDescription: 'The system loses track of where data came from — which document, which API, which version — making it impossible to reconstruct the decision trail during a regulatory audit.',
    kpiMetric: 'breachCount',
    regulatoryRef: 'JMLSG §5.8 — Record-keeping requirements; Basel §43 — Audit trail completeness',
  },
  'document-forgery': {
    businessDescription: 'Fraudsters submit AI-generated fake identity documents (deepfake passports, synthetic utility bills) that pass automated verification, allowing fraudulent account opening.',
    kpiMetric: 'falseNegativeRate',
    regulatoryRef: 'JMLSG §5.3.4 — Enhanced verification for non-face-to-face; FCA FCG 3.2.4 — Document authenticity checks',
  },
  'ubo-misidentification': {
    businessDescription: 'The system incorrectly identifies who really owns or controls a company. This could mean missing a sanctioned individual hiding behind shell companies, or flagging innocent shareholders.',
    kpiMetric: 'falseNegativeRate',
    regulatoryRef: 'JMLSG §5.4.8 — UBO identification for legal persons; Basel §21-23 — Beneficial ownership requirements',
  },
  'data-source-manipulation': {
    businessDescription: 'External data sources (company registries, credit bureaux) are compromised or spoofed, feeding false information into the verification pipeline and leading to incorrect risk assessments.',
    kpiMetric: 'breachCount',
    regulatoryRef: 'FCA FCG 3.2.4 — Reliability of data sources used in CDD',
  },
  'sanctions-false-negative': {
    businessDescription: 'A sanctioned individual or entity is not detected during screening — due to name variations, transliteration differences, or fuzzy-match failures. This is the highest-severity compliance failure.',
    kpiMetric: 'falseNegativeRate',
    regulatoryRef: 'Sanctions Act 2018; JMLSG §5.5 — Sanctions screening; Wolfsberg Q7 — Screening effectiveness',
  },
  'false-positive-flooding': {
    businessDescription: 'The screening system generates too many false alerts, overwhelming human reviewers and causing "alert fatigue" — making it more likely that real positives are missed among the noise.',
    kpiMetric: 'falsePositiveRate',
    regulatoryRef: 'FCA FCG 3.2.1 — Proportionate and effective screening systems',
  },
  'stale-screening-data': {
    businessDescription: 'Sanctions and PEP lists haven\'t been updated, meaning new designations are missed. A newly sanctioned entity could be approved based on yesterday\'s data.',
    kpiMetric: 'falseNegativeRate',
    regulatoryRef: 'JMLSG §5.5.6 — Screening list currency; FCA FCG 3.2.1 — Up-to-date screening',
  },
  'geographic-risk-miscalc': {
    businessDescription: 'The system applies the wrong country risk weighting — treating a high-risk jurisdiction as standard, or vice versa — leading to inappropriate due diligence levels.',
    kpiMetric: 'evalScoreTrend',
    regulatoryRef: 'JMLSG §5.5.3 — Geographic risk factors; Basel §36 — Country risk assessment',
  },
  'hallucination': {
    businessDescription: 'The AI invents information that doesn\'t exist in the source documents — fabricating revenue figures, inventing company filings, or citing non-existent regulations. Decisions based on hallucinated data are invalid.',
    kpiMetric: 'evalScoreTrend',
    regulatoryRef: 'FCA Consumer Duty — Acting in good faith with accurate information; FINOS AI Governance — Output accuracy',
  },
  'algorithmic-bias': {
    businessDescription: 'The credit model systematically treats certain groups unfairly — denying more applications from specific postcodes, age groups, or ethnicities without legitimate business justification.',
    kpiMetric: 'evalScoreTrend',
    regulatoryRef: 'Equality Act 2010 — Protected characteristics; FCA Consumer Duty — Fair treatment; EU AI Act Art. 10 — Data governance for bias prevention',
  },
  'calculation-error': {
    businessDescription: 'A mathematical mistake in financial analysis — wrong debt-service coverage ratio, incorrect loan-to-value, or misapplied interest calculations — leads to approving unaffordable credit or rejecting viable applications.',
    kpiMetric: 'evalScoreTrend',
    regulatoryRef: 'FCA MCOB — Mortgage conduct; Basel §34 — Credit risk measurement accuracy',
  },
  'agent-conflict': {
    businessDescription: 'Multiple AI agents disagree on a risk assessment (one says approve, another says escalate) and the system has no clear way to resolve the conflict, potentially leading to inconsistent or delayed decisions.',
    kpiMetric: 'agentAgreementRate',
    regulatoryRef: 'Internal control principle — Clear accountability and consistent decision-making',
  },
  'unauthorised-data-access': {
    businessDescription: 'An agent accesses customer financial data it shouldn\'t see for the current task — viewing credit history when only identity verification is required, or accessing Tier 3 data for a Tier 1 customer.',
    kpiMetric: 'policyTriggerRate',
    regulatoryRef: 'GDPR Article 25 — Data protection by design; FCA SYSC 6.1.1 — Effective access controls',
  },
  'policy-bypass': {
    businessDescription: 'The AI agent skips the policy evaluation step entirely — proceeding with a decision without checking whether it\'s authorized. This means decisions are made outside the governance framework.',
    kpiMetric: 'policyTriggerRate',
    regulatoryRef: 'FCA SYSC 6.3.1 — Internal governance arrangements; JMLSG §5.6 — Policy and procedure compliance',
  },
  'rule-staleness': {
    businessDescription: 'The policy rules haven\'t been updated to reflect recent regulatory changes. The system enforces yesterday\'s rules while today\'s regulations require different controls.',
    kpiMetric: 'policyTriggerRate',
    regulatoryRef: 'FCA FCG 2.2 — Keeping policies current; JMLSG §5.6 — Regular review of controls',
  },
  'blast-radius': {
    businessDescription: 'A policy engine error affects many cases at once — incorrectly auto-approving a batch of high-risk applications, or blocking all low-risk applications. The damage multiplies with volume.',
    kpiMetric: 'escalationRate',
    regulatoryRef: 'Basel §14-15 — Operational risk limits; FCA SYSC 6.3 — Proportionate controls',
  },
  'config-drift': {
    businessDescription: 'The policy store gradually diverges from its intended state due to uncontrolled modifications — someone changes a threshold, a deployment overwrites a rule — and the system silently operates under wrong assumptions.',
    kpiMetric: 'policyTriggerRate',
    regulatoryRef: 'FCA SYSC 6.1 — Change management; COBIT AI Governance — Configuration integrity',
  },
  'escalation-failure': {
    businessDescription: 'A case that requires human judgment isn\'t routed to a reviewer — either the escalation threshold is misconfigured or the routing logic fails silently. High-risk decisions get made without human oversight.',
    kpiMetric: 'escalationRate',
    regulatoryRef: 'JMLSG §5.6.12 — Escalation procedures; Basel §41 — Human oversight requirements',
  },
  'sla-breach': {
    businessDescription: 'A human reviewer doesn\'t act on a case within the required timeframe. The case sits in queue beyond regulatory deadlines, potentially breaching customer service standards or statutory response times.',
    kpiMetric: 'meanTimeToEscalation',
    regulatoryRef: 'MLR 2017 Reg. 30A — Timely response; FCA FCG 3.2.7 — Reasonable timeframes',
  },
  'reviewer-bias': {
    businessDescription: 'Human reviewers develop "rubber-stamping" habits — approving cases without proper scrutiny because the AI recommended approval. Over time, the human check becomes a formality rather than genuine oversight.',
    kpiMetric: 'overrideRate',
    regulatoryRef: 'FCA FCG 2.1 — Independent review capability; Basel §41 — Effective human oversight',
  },
  'token-manipulation': {
    businessDescription: 'An attacker intercepts or replays the cryptographic token used to prove human review occurred — forging an approval without genuine human judgment. This defeats the entire HITL control.',
    kpiMetric: 'breachCount',
    regulatoryRef: 'FCA SYSC 6.1.1 — Authentication controls; Cyber security principles — Token integrity',
  },
  'audit-trail-incomplete': {
    businessDescription: 'The decision rationale isn\'t fully captured — why the AI recommended X, what evidence it considered, what the reviewer checked. During a regulatory inquiry, the firm cannot reconstruct how decisions were made.',
    kpiMetric: 'breachCount',
    regulatoryRef: 'JMLSG §5.8 — Record-keeping; MLR 2017 Reg. 40 — 5-year retention; Basel §43 — Audit completeness',
  },
  'sar-filing-error': {
    businessDescription: 'A Suspicious Activity Report contains AI-hallucinated details, omits material facts, or is filed for the wrong reason. This can trigger NCA investigation on false grounds or — worse — fail to report genuine suspicious activity.',
    kpiMetric: 'sarConversionRate',
    regulatoryRef: 'POCA 2002 §330 — Failure to disclose; FCA FCG 3.3 — SAR filing obligations',
  },
  'model-drift': {
    businessDescription: 'Agent quality slowly degrades over weeks without anyone noticing — accuracy drops, decisions become inconsistent, but there\'s no sudden failure to trigger an alarm. Past decisions made during the drift period may need review.',
    kpiMetric: 'evalScoreTrend',
    regulatoryRef: 'FCA FCG 2.2 — Ongoing model monitoring; FINOS AI Governance — Continuous evaluation',
  },
  'data-retention-violation': {
    businessDescription: 'Records are kept too long (GDPR says delete) or deleted too early (AML says keep 5 years). Navigating the conflict between privacy law and financial crime regulation requires precise retention rules.',
    kpiMetric: 'breachCount',
    regulatoryRef: 'GDPR Article 17 — Right to erasure; MLR 2017 Reg. 40 — 5-year retention requirement',
  },
  'decision-inconsistency': {
    businessDescription: 'Two nearly identical cases receive materially different outcomes (one approved, one denied) without clear justification. This violates fair treatment principles and exposes the firm to discrimination claims.',
    kpiMetric: 'agentAgreementRate',
    regulatoryRef: 'FCA Consumer Duty — Consistent fair outcomes; Equality Act 2010 — Non-discrimination',
  },
};
