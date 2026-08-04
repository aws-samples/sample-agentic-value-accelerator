/**
 * Risk Management mock data
 *
 * Risk taxonomy based on:
 * - OWASP Agentic AI — Threats and Mitigations v1.1 (Dec 2025), threats T1–T17
 * - NIST AI RMF risk categories
 * - SR 26-2 model risk dimensions
 * - EU AI Act high-risk considerations
 *
 * The T1–T17 codes below are the official OWASP Agentic Security Initiative (ASI)
 * threat IDs from "Agentic AI – Threats and Mitigations" v1.1.
 */

// ─────────────────────────── Types ───────────────────────────

export type RiskCategory =
  | 'model-performance'
  | 'bias-fairness'
  | 'data-quality'
  | 'security'
  | 'privacy'
  | 'operational'
  | 'compliance'
  | 'reputational'
  | 'financial'
  | 'third-party';

// Official OWASP Agentic AI – Threats and Mitigations v1.1 threat IDs (T1–T17)
export type AgenticRiskCategory =
  | 'T1'  // Memory Poisoning
  | 'T2'  // Tool Misuse
  | 'T3'  // Privilege Compromise
  | 'T4'  // Resource Overload
  | 'T5'  // Cascading Hallucination Attacks
  | 'T6'  // Intent Breaking & Goal Manipulation
  | 'T7'  // Misaligned & Deceptive Behaviors
  | 'T8'  // Repudiation & Untraceability
  | 'T9'  // Identity Spoofing & Impersonation
  | 'T10' // Overwhelming Human in the Loop
  | 'T11' // Unexpected RCE and Code Attacks
  | 'T12' // Agent Communication Poisoning
  | 'T13' // Rogue Agents in Multi-Agent Systems
  | 'T14' // Human Attacks on Multi-Agent Systems
  | 'T15' // Human Manipulation
  | 'T16' // Insecure Inter-Agent Protocol Abuse
  | 'T17'; // Supply Chain Compromise

export type RiskStatus = 'open' | 'mitigated' | 'accepted' | 'closed';
export type RiskTrend = 'increasing' | 'stable' | 'decreasing';
export type Likelihood = 1 | 2 | 3 | 4 | 5;
export type Severity = 1 | 2 | 3 | 4 | 5;

export type Risk = {
  id: string;
  title: string;
  description: string;
  category: RiskCategory;
  status: RiskStatus;
  owner: string;
  ownerRole: string;
  inherentLikelihood: Likelihood;
  inherentSeverity: Severity;
  inherentScore: number;
  residualLikelihood: Likelihood;
  residualSeverity: Severity;
  residualScore: number;
  trend: RiskTrend;
  controlIds: string[];
  affectedAssets: string[];
  dateIdentified: string;
  lastReviewed: string;
  nextReview: string;
  notes?: string;
  // ── Enterprise-metrics fields (optional; align with the AWS Agentic AI
  //    Enterprise Metrics workbook's Risk & Governance sheet). Optional so
  //    existing rows stay valid; the metric adapter falls back sensibly when
  //    absent. ────────────────────────────────────────────────────────────
  /** Per-risk threshold the residual must stay under (workbook "Threshold"). */
  riskThreshold?: number;
  /** Control effectiveness 0..1; residual = rawScore × (1 - effectiveness). */
  controlEffectiveness?: number;
  /** How fast this risk can materialize — drives monitoring urgency. */
  riskVelocity?: 'slow' | 'medium' | 'immediate';
  /** The early-warning signal watched for this risk (e.g. "PSI >0.2 weekly"). */
  leadingIndicator?: string;
  /** Optional entity scope so a risk can deep-link to the use case it threatens. */
  useCaseId?: string;
};

export type Control = {
  id: string;
  name: string;
  description: string;
  type: 'preventive' | 'detective' | 'corrective';
  category: RiskCategory;
  status: 'implemented' | 'partial' | 'planned' | 'not-implemented';
  effectiveness: 'high' | 'medium' | 'low';
  owner: string;
  evidence?: string;
  evidenceLink?: string;
  lastTested?: string;
  riskIds: string[];
  frameworks: string[];
};

export type Issue = {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'in-progress' | 'remediated' | 'closed';
  source: 'audit' | 'assessment' | 'incident' | 'self-identified';
  riskId?: string;
  controlId?: string;
  owner: string;
  dueDate: string;
  dateIdentified: string;
  remediation?: string;
};

export type Assessment = {
  id: string;
  name: string;
  type: 'initial' | 'periodic' | 'change-triggered';
  status: 'draft' | 'in-progress' | 'completed' | 'approved';
  scope: string;
  assessor: string;
  startDate: string;
  completedDate?: string;
  risksIdentified: number;
  controlsEvaluated: number;
  findings: number;
};

// ─────────────────────────── Constants ───────────────────────────

export const RISK_CATEGORIES: { id: RiskCategory; name: string; icon: string; color: string }[] = [
  { id: 'model-performance', name: 'Model Performance', icon: 'chart-bar', color: '#3b82f6' },
  { id: 'bias-fairness', name: 'Bias & Fairness', icon: 'scale', color: '#8b5cf6' },
  { id: 'data-quality', name: 'Data Quality', icon: 'circle-stack', color: '#06b6d4' },
  { id: 'security', name: 'Security', icon: 'shield-check', color: '#ef4444' },
  { id: 'privacy', name: 'Privacy', icon: 'lock-closed', color: '#f59e0b' },
  { id: 'operational', name: 'Operational', icon: 'cog', color: '#10b981' },
  { id: 'compliance', name: 'Regulatory', icon: 'clipboard-list', color: '#6366f1' },
  { id: 'reputational', name: 'Reputational', icon: 'building-office', color: '#ec4899' },
  { id: 'financial', name: 'Financial', icon: 'banknotes', color: '#14b8a6' },
  { id: 'third-party', name: 'Third Party', icon: 'hand-raised', color: '#78716c' },
];

// Official OWASP Agentic AI – Threats and Mitigations v1.1 (T1–T17).
// Names, descriptions, and mitigations follow the OWASP detailed threat table.
export const AGENTIC_RISK_CATEGORIES: { id: AgenticRiskCategory; name: string; description: string; icon: string; color: string; mitigations: string[] }[] = [
  {
    id: 'T1',
    name: 'Memory Poisoning',
    description: 'Exploiting an AI\'s short- and long-term memory systems to introduce malicious or false data and exploit the agent\'s context, leading to altered decisions and unauthorized operations.',
    icon: 'cpu-chip',
    color: '#0d9488',
    mitigations: ['Memory content validation', 'Session isolation', 'Anomaly detection on memory', 'Memory snapshots & rollback'],
  },
  {
    id: 'T2',
    name: 'Tool Misuse',
    description: 'Attackers manipulate agents to abuse integrated tools through deceptive prompts while operating within authorized permissions, including agent hijacking via adversarial data.',
    icon: 'wrench-screwdriver',
    color: '#ea580c',
    mitigations: ['Strict tool access verification', 'Tool rate-limiting', 'Instruction validation', 'Tool-call execution logging'],
  },
  {
    id: 'T3',
    name: 'Privilege Compromise',
    description: 'Attackers exploit weaknesses in permission management — dynamic role inheritance or misconfiguration — to perform unauthorized actions.',
    icon: 'finger-print',
    color: '#d97706',
    mitigations: ['Granular permission controls', 'Dynamic access validation', 'Role-change monitoring', 'No cross-agent delegation without authorization'],
  },
  {
    id: 'T4',
    name: 'Resource Overload',
    description: 'Targets the computational, memory, and service capacities of AI systems to degrade performance or cause failures, exploiting their resource-intensive nature.',
    icon: 'bolt',
    color: '#65a30d',
    mitigations: ['Resource management controls', 'Adaptive scaling', 'Quotas & rate-limiting', 'Real-time load monitoring'],
  },
  {
    id: 'T5',
    name: 'Cascading Hallucination Attacks',
    description: 'Exploits an AI\'s tendency to generate plausible but false information that propagates through systems, disrupting decision-making and tool invocation.',
    icon: 'exclamation-triangle',
    color: '#7c3aed',
    mitigations: ['Robust output validation', 'Multi-source validation', 'Behavioral constraints', 'Secondary validation of AI knowledge'],
  },
  {
    id: 'T6',
    name: 'Intent Breaking & Goal Manipulation',
    description: 'Exploits vulnerabilities in an agent\'s planning and goal-setting, allowing attackers to manipulate or redirect objectives and reasoning (related to LLM01 Prompt Injection).',
    icon: 'flag',
    color: '#dc2626',
    mitigations: ['Planning validation frameworks', 'Reflection boundary management', 'Goal-alignment protection', 'AI behavioral auditing'],
  },
  {
    id: 'T7',
    name: 'Misaligned & Deceptive Behaviors',
    description: 'Agents execute harmful or disallowed actions via deceptive reasoning or misinterpreted goals — emerging from advanced reasoning, distinct from hallucination.',
    icon: 'face-frown',
    color: '#be123c',
    mitigations: ['Train to refuse harmful tasks', 'Policy restrictions', 'Human confirmation for high-risk actions', 'Deception detection / red teaming'],
  },
  {
    id: 'T8',
    name: 'Repudiation & Untraceability',
    description: 'Actions performed by agents cannot be traced or accounted for due to insufficient logging or transparency in decision-making.',
    icon: 'document-magnifying-glass',
    color: '#9333ea',
    mitigations: ['Comprehensive logging', 'Cryptographically signed immutable logs', 'Enriched metadata', 'Real-time monitoring'],
  },
  {
    id: 'T9',
    name: 'Identity Spoofing & Impersonation',
    description: 'Attackers exploit authentication mechanisms to impersonate agents or users — including theft of a persistent agent identity (e.g. Entra Agent ID) — to act under false identities.',
    icon: 'identification',
    color: '#c026d3',
    mitigations: ['Identity validation frameworks', 'Trust-boundary enforcement', 'Least-privilege access', 'Behavioral profiling'],
  },
  {
    id: 'T10',
    name: 'Overwhelming Human in the Loop',
    description: 'Targets systems with human oversight, exploiting human cognitive limits or compromising the interaction framework to bypass review.',
    icon: 'users',
    color: '#0891b2',
    mitigations: ['Adaptive trust mechanisms', 'Dynamic intervention thresholds', 'Hierarchical AI-human collaboration', 'Risk-based review prioritization'],
  },
  {
    id: 'T11',
    name: 'Unexpected RCE and Code Attacks',
    description: 'Attackers exploit AI-generated execution environments to inject malicious code, trigger unintended behavior, or run unauthorized scripts.',
    icon: 'code-bracket',
    color: '#16a34a',
    mitigations: ['Restrict code-generation permissions', 'Sandboxed execution', 'Monitor AI-generated scripts', 'Manual review for elevated-privilege code'],
  },
  {
    id: 'T12',
    name: 'Agent Communication Poisoning',
    description: 'Attackers manipulate communication channels between agents to spread false information, disrupt workflows, or influence decision-making.',
    icon: 'arrows-right-left',
    color: '#2563eb',
    mitigations: ['Cryptographic message authentication', 'Communication validation policies', 'Inter-agent anomaly monitoring', 'Multi-agent consensus verification'],
  },
  {
    id: 'T13',
    name: 'Rogue Agents in Multi-Agent Systems',
    description: 'Malicious or compromised agents operate outside monitoring boundaries, executing unauthorized actions or spreading "infectious backdoors" to other agents.',
    icon: 'bug-ant',
    color: '#e11d48',
    mitigations: ['Policy-constrained autonomy', 'Continuous behavioral monitoring', 'Controlled hosting environments', 'AI red teaming'],
  },
  {
    id: 'T14',
    name: 'Human Attacks on Multi-Agent Systems',
    description: 'Adversaries exploit inter-agent delegation, trust relationships, and workflow dependencies to escalate privileges or manipulate AI-driven operations.',
    icon: 'user-group',
    color: '#db2777',
    mitigations: ['Restrict agent delegation', 'Inter-agent authentication', 'Behavioral monitoring', 'Multi-agent task segmentation'],
  },
  {
    id: 'T15',
    name: 'Human Manipulation',
    description: 'Attackers abuse the user\'s implicit trust in an agent to manipulate the human — spreading misinformation or coercing harmful actions through the agent.',
    icon: 'hand-raised',
    color: '#f43f5e',
    mitigations: ['Monitor agent behavior vs. role', 'Restrict tool access / link rendering', 'Response validation guardrails', 'Moderation APIs'],
  },
  {
    id: 'T16',
    name: 'Insecure Inter-Agent Protocol Abuse',
    description: 'Attacks target flaws in protocols like MCP or A2A — consent bypass or context hijacking — leading to unauthorized agent actions.',
    icon: 'link',
    color: '#0e7490',
    mitigations: ['Strong inter-agent authentication', 'Protocol-data sanitization & validation', 'Tightly scoped delegation', 'Encrypted communications & logging'],
  },
  {
    id: 'T17',
    name: 'Supply Chain Compromise',
    description: 'Compromised models, libraries, tools, prompts, or build environments introduce vulnerable or malicious components that let attackers manipulate agent actions or run arbitrary code.',
    icon: 'cube',
    color: '#ca8a04',
    mitigations: ['Digitally sign artifacts', 'Verifiable SBOMs (AIBOM / Agent SBOM)', 'Version control & peer review', 'Sandbox isolation & drift monitoring'],
  },
];

export const LIKELIHOOD_LABELS: Record<Likelihood, string> = {
  1: 'Rare',
  2: 'Unlikely',
  3: 'Possible',
  4: 'Likely',
  5: 'Almost Certain',
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  1: 'Negligible',
  2: 'Minor',
  3: 'Moderate',
  4: 'Major',
  5: 'Severe',
};

export const getRiskClass = (score: number): { label: string; color: string; bgColor: string } => {
  if (score >= 20) return { label: 'Critical', color: '#991b1b', bgColor: 'bg-red-100 text-red-800 border-red-200' };
  if (score >= 15) return { label: 'High', color: '#c2410c', bgColor: 'bg-orange-100 text-orange-800 border-orange-200' };
  if (score >= 10) return { label: 'Medium', color: '#a16207', bgColor: 'bg-amber-100 text-amber-800 border-amber-200' };
  if (score >= 5) return { label: 'Low', color: '#15803d', bgColor: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
  return { label: 'Very Low', color: '#475569', bgColor: 'bg-slate-100 text-slate-700 border-slate-200' };
};

// ─────────────────────────── Mock Data ───────────────────────────

export const RISKS: Risk[] = [
  {
    id: 'RSK-001',
    title: 'Model produces biased credit decisions',
    description: 'Credit decisioning model may produce disparate outcomes across protected classes, leading to fair lending violations.',
    category: 'bias-fairness',
    status: 'mitigated',
    owner: 'S. Chen',
    ownerRole: 'RAI Council Lead',
    inherentLikelihood: 4,
    inherentSeverity: 5,
    inherentScore: 20,
    residualLikelihood: 2,
    residualSeverity: 5,
    residualScore: 10,
    trend: 'stable',
    controlIds: ['CTL-001', 'CTL-002', 'CTL-003'],
    affectedAssets: ['Credit Risk Agent', 'Loan Origination Model'],
    dateIdentified: '2025-06-15',
    lastReviewed: '2026-05-15',
    nextReview: '2026-08-15',
    riskThreshold: 9,
    controlEffectiveness: 0.5,
    riskVelocity: 'slow',
    leadingIndicator: 'Bias drift score >5% monthly',
  },
  {
    id: 'RSK-002',
    title: 'Hallucinated financial advice',
    description: 'Model generates inaccurate or fabricated financial information that could mislead customers or result in regulatory violations.',
    category: 'model-performance',
    status: 'mitigated',
    owner: 'J. Martinez',
    ownerRole: 'ML Platform Lead',
    inherentLikelihood: 3,
    inherentSeverity: 5,
    inherentScore: 15,
    residualLikelihood: 1,
    residualSeverity: 5,
    residualScore: 5,
    trend: 'decreasing',
    controlIds: ['CTL-004', 'CTL-005', 'CTL-006'],
    affectedAssets: ['Trading Assistant', 'Wealth Advisory Agent'],
    dateIdentified: '2025-08-01',
    lastReviewed: '2026-05-10',
    nextReview: '2026-08-10',
    riskThreshold: 12,
    controlEffectiveness: 0.45,
    riskVelocity: 'immediate',
    leadingIndicator: 'Hallucination rate >5%; RAG miss >10%',
  },
  {
    id: 'RSK-003',
    title: 'PII exposure in model outputs',
    description: 'Model may inadvertently expose customer PII in responses, logs, or to downstream systems.',
    category: 'privacy',
    status: 'mitigated',
    owner: 'R. Patel',
    ownerRole: 'Privacy Officer',
    inherentLikelihood: 4,
    inherentSeverity: 4,
    inherentScore: 16,
    residualLikelihood: 2,
    residualSeverity: 4,
    residualScore: 8,
    trend: 'stable',
    controlIds: ['CTL-007', 'CTL-008'],
    affectedAssets: ['Customer Service Agent', 'KYC Banking Agent'],
    dateIdentified: '2025-07-20',
    lastReviewed: '2026-05-01',
    nextReview: '2026-08-01',
  },
  {
    id: 'RSK-004',
    title: 'Prompt injection attacks',
    description: 'Malicious inputs could manipulate model behavior to bypass controls, extract data, or perform unauthorized actions.',
    category: 'security',
    status: 'open',
    owner: 'T. Wilson',
    ownerRole: 'Security Lead',
    inherentLikelihood: 3,
    inherentSeverity: 4,
    inherentScore: 12,
    residualLikelihood: 2,
    residualSeverity: 4,
    residualScore: 8,
    trend: 'increasing',
    controlIds: ['CTL-009', 'CTL-010'],
    affectedAssets: ['All customer-facing agents'],
    dateIdentified: '2025-09-10',
    lastReviewed: '2026-05-20',
    nextReview: '2026-06-20',
    notes: 'Red team exercise scheduled for Q3',
  },
  {
    id: 'RSK-005',
    title: 'Model drift degrades performance',
    description: 'Model performance degrades over time due to data drift, concept drift, or environmental changes.',
    category: 'model-performance',
    status: 'mitigated',
    owner: 'J. Martinez',
    ownerRole: 'ML Platform Lead',
    inherentLikelihood: 4,
    inherentSeverity: 3,
    inherentScore: 12,
    residualLikelihood: 2,
    residualSeverity: 3,
    residualScore: 6,
    trend: 'stable',
    controlIds: ['CTL-011', 'CTL-012'],
    affectedAssets: ['All production models'],
    dateIdentified: '2025-06-01',
    lastReviewed: '2026-04-15',
    nextReview: '2026-07-15',
  },
  {
    id: 'RSK-006',
    title: 'Inadequate model documentation',
    description: 'Insufficient documentation of model design, assumptions, and limitations may impede validation and audit.',
    category: 'compliance',
    status: 'open',
    owner: 'A. Williams',
    ownerRole: 'MRM Committee',
    inherentLikelihood: 3,
    inherentSeverity: 3,
    inherentScore: 9,
    residualLikelihood: 2,
    residualSeverity: 3,
    residualScore: 6,
    trend: 'decreasing',
    controlIds: ['CTL-013'],
    affectedAssets: ['Nova Pro', 'Nova Lite'],
    dateIdentified: '2026-01-15',
    lastReviewed: '2026-05-01',
    nextReview: '2026-06-01',
  },
  {
    id: 'RSK-007',
    title: 'Third-party model vendor risk',
    description: 'Reliance on third-party model providers (Anthropic, Amazon) introduces dependency and limited transparency risks.',
    category: 'third-party',
    status: 'accepted',
    owner: 'M. Garcia',
    ownerRole: 'Vendor Management',
    inherentLikelihood: 2,
    inherentSeverity: 4,
    inherentScore: 8,
    residualLikelihood: 2,
    residualSeverity: 4,
    residualScore: 8,
    trend: 'stable',
    controlIds: ['CTL-014', 'CTL-015'],
    affectedAssets: ['All Bedrock models'],
    dateIdentified: '2025-05-01',
    lastReviewed: '2026-04-01',
    nextReview: '2026-10-01',
    notes: 'Risk accepted per board approval. Multi-vendor strategy in place.',
  },
  {
    id: 'RSK-008',
    title: 'Unexplainable model decisions',
    description: 'Inability to explain model decisions may violate adverse action notice requirements under ECOA.',
    category: 'compliance',
    status: 'open',
    owner: 'S. Chen',
    ownerRole: 'RAI Council Lead',
    inherentLikelihood: 3,
    inherentSeverity: 4,
    inherentScore: 12,
    residualLikelihood: 2,
    residualSeverity: 4,
    residualScore: 8,
    trend: 'decreasing',
    controlIds: ['CTL-016'],
    affectedAssets: ['Credit Risk Agent', 'Loan Origination Model'],
    dateIdentified: '2025-08-15',
    lastReviewed: '2026-05-10',
    nextReview: '2026-06-10',
    notes: 'Explainability module deployment in progress',
  },
  {
    id: 'RSK-009',
    title: 'Cost overrun from uncontrolled usage',
    description: 'Unexpected usage patterns or inefficient prompts may lead to significant cost overruns.',
    category: 'financial',
    status: 'mitigated',
    owner: 'K. Brown',
    ownerRole: 'FinOps Lead',
    inherentLikelihood: 4,
    inherentSeverity: 2,
    inherentScore: 8,
    residualLikelihood: 2,
    residualSeverity: 2,
    residualScore: 4,
    trend: 'stable',
    controlIds: ['CTL-017', 'CTL-018'],
    affectedAssets: ['All agents'],
    dateIdentified: '2025-07-01',
    lastReviewed: '2026-05-01',
    nextReview: '2026-08-01',
  },
  {
    id: 'RSK-010',
    title: 'Training data quality issues',
    description: 'Poor quality, outdated, or biased training data may compromise model accuracy and fairness.',
    category: 'data-quality',
    status: 'mitigated',
    owner: 'D. Lee',
    ownerRole: 'Data Governance',
    inherentLikelihood: 3,
    inherentSeverity: 4,
    inherentScore: 12,
    residualLikelihood: 2,
    residualSeverity: 4,
    residualScore: 8,
    trend: 'stable',
    controlIds: ['CTL-019', 'CTL-020'],
    affectedAssets: ['Fine-tuned models', 'RAG knowledge bases'],
    dateIdentified: '2025-06-15',
    lastReviewed: '2026-04-20',
    nextReview: '2026-07-20',
  },
];

// ─────────────────────────── OWASP Agentic AI Risks ───────────────────────────

export type AgenticRisk = {
  id: string;
  title: string;
  description: string;
  category: AgenticRiskCategory;
  status: RiskStatus;
  owner: string;
  ownerRole: string;
  inherentLikelihood: Likelihood;
  inherentSeverity: Severity;
  inherentScore: number;
  residualLikelihood: Likelihood;
  residualSeverity: Severity;
  residualScore: number;
  trend: RiskTrend;
  controlIds: string[];
  affectedAgents: string[];
  chainRisk?: {
    cascadeScore: number;
    blastRadius: number;
    chainDepth: number;
    humanGates: number;
  };
  dateIdentified: string;
  lastReviewed: string;
  nextReview: string;
  notes?: string;
};

export const AGENTIC_RISKS: AgenticRisk[] = [
  {
    id: 'ASI-001',
    title: 'Prompt injection in customer service agent',
    description: 'Customer-facing chat agent vulnerable to goal hijacking through crafted inputs that override system instructions.',
    category: 'T6',
    status: 'open',
    owner: 'T. Wilson',
    ownerRole: 'Security Lead',
    inherentLikelihood: 4,
    inherentSeverity: 4,
    inherentScore: 16,
    residualLikelihood: 3,
    residualSeverity: 4,
    residualScore: 12,
    trend: 'increasing',
    controlIds: ['CTL-009', 'CTL-010'],
    affectedAgents: ['Customer Service Bot', 'Support Assistant'],
    chainRisk: { cascadeScore: 42, blastRadius: 15, chainDepth: 2, humanGates: 1 },
    dateIdentified: '2026-03-15',
    lastReviewed: '2026-06-01',
    nextReview: '2026-07-01',
    notes: 'Red team identified 3 bypass techniques in Q2 testing',
  },
  {
    id: 'ASI-002',
    title: 'Tool misuse in fraud detection pipeline',
    description: 'Fraud detection agent can invoke account blocking tool with insufficient validation, risking false positives.',
    category: 'T2',
    status: 'mitigated',
    owner: 'J. Martinez',
    ownerRole: 'ML Platform Lead',
    inherentLikelihood: 3,
    inherentSeverity: 5,
    inherentScore: 15,
    residualLikelihood: 2,
    residualSeverity: 5,
    residualScore: 10,
    trend: 'decreasing',
    controlIds: ['CTL-021', 'CTL-022'],
    affectedAgents: ['Fraud Classifier', 'Deep Analyst'],
    chainRisk: { cascadeScore: 68, blastRadius: 35, chainDepth: 3, humanGates: 2 },
    dateIdentified: '2026-02-01',
    lastReviewed: '2026-05-20',
    nextReview: '2026-08-20',
    notes: 'Approval gate added for high-confidence blocks',
  },
  {
    id: 'ASI-003',
    title: 'Excessive IAM permissions for compliance agent',
    description: 'Compliance review agent has cross-account access and regulatory submission permissions exceeding operational need.',
    category: 'T3',
    status: 'open',
    owner: 'R. Patel',
    ownerRole: 'IAM Admin',
    inherentLikelihood: 2,
    inherentSeverity: 5,
    inherentScore: 10,
    residualLikelihood: 2,
    residualSeverity: 5,
    residualScore: 10,
    trend: 'stable',
    controlIds: ['CTL-023'],
    affectedAgents: ['Compliance Analyzer', 'Finding Validator'],
    chainRisk: { cascadeScore: 85, blastRadius: 52, chainDepth: 4, humanGates: 1 },
    dateIdentified: '2026-04-10',
    lastReviewed: '2026-06-05',
    nextReview: '2026-07-05',
    notes: 'IAM policy review in progress - blocked by dependencies',
  },
  {
    id: 'ASI-004',
    title: 'Unvetted MCP server in customer workflow',
    description: 'ServiceNow MCP server added without security review, exposing 8 tools with ticket CRUD capabilities.',
    category: 'T17',
    status: 'open',
    owner: 'M. Garcia',
    ownerRole: 'Vendor Management',
    inherentLikelihood: 3,
    inherentSeverity: 4,
    inherentScore: 12,
    residualLikelihood: 3,
    residualSeverity: 4,
    residualScore: 12,
    trend: 'increasing',
    controlIds: [],
    affectedAgents: ['Service Agent', 'Intent Router'],
    chainRisk: { cascadeScore: 45, blastRadius: 22, chainDepth: 2, humanGates: 0 },
    dateIdentified: '2026-05-20',
    lastReviewed: '2026-06-10',
    nextReview: '2026-06-20',
    notes: 'Security review scheduled for June 25',
  },
  {
    id: 'ASI-005',
    title: 'Memory poisoning in multi-session agent',
    description: 'Customer service agent persists conversation context that could be manipulated to affect future sessions.',
    category: 'T1',
    status: 'mitigated',
    owner: 'S. Chen',
    ownerRole: 'RAI Council Lead',
    inherentLikelihood: 3,
    inherentSeverity: 3,
    inherentScore: 9,
    residualLikelihood: 2,
    residualSeverity: 3,
    residualScore: 6,
    trend: 'decreasing',
    controlIds: ['CTL-024', 'CTL-025'],
    affectedAgents: ['Customer Service Bot'],
    chainRisk: { cascadeScore: 28, blastRadius: 8, chainDepth: 1, humanGates: 0 },
    dateIdentified: '2026-01-20',
    lastReviewed: '2026-05-15',
    nextReview: '2026-08-15',
    notes: 'Session isolation implemented with daily memory flush',
  },
  {
    id: 'ASI-006',
    title: 'Cascading failures in fraud pipeline',
    description: 'Hallucinations from classifier agent propagate through analyst agent to output decisions without grounding checks.',
    category: 'T5',
    status: 'open',
    owner: 'J. Martinez',
    ownerRole: 'ML Platform Lead',
    inherentLikelihood: 3,
    inherentSeverity: 5,
    inherentScore: 15,
    residualLikelihood: 2,
    residualSeverity: 5,
    residualScore: 10,
    trend: 'stable',
    controlIds: ['CTL-005', 'CTL-026'],
    affectedAgents: ['Fraud Classifier', 'Deep Analyst'],
    chainRisk: { cascadeScore: 72, blastRadius: 40, chainDepth: 3, humanGates: 1 },
    dateIdentified: '2026-03-01',
    lastReviewed: '2026-06-01',
    nextReview: '2026-07-01',
    notes: 'Circuit breaker implementation in progress',
  },
  {
    id: 'ASI-007',
    title: 'Trust boundary violation in regulatory submission',
    description: 'Compliance agent can submit to external regulatory portal without proper approval chain for cross-boundary access.',
    category: 'T3',
    status: 'accepted',
    owner: 'A. Williams',
    ownerRole: 'MRM Committee',
    inherentLikelihood: 2,
    inherentSeverity: 5,
    inherentScore: 10,
    residualLikelihood: 1,
    residualSeverity: 5,
    residualScore: 5,
    trend: 'stable',
    controlIds: ['CTL-027', 'CTL-028'],
    affectedAgents: ['Finding Validator'],
    chainRisk: { cascadeScore: 92, blastRadius: 65, chainDepth: 4, humanGates: 3 },
    dateIdentified: '2026-02-15',
    lastReviewed: '2026-05-01',
    nextReview: '2026-11-01',
    notes: 'Risk accepted with dual-approval gate and audit logging',
  },
  {
    id: 'ASI-008',
    title: 'Rogue autonomy in trading assistant',
    description: 'Trading assistant agent can execute portfolio changes above intended autonomy threshold without human confirmation.',
    category: 'T13',
    status: 'open',
    owner: 'K. Brown',
    ownerRole: 'FinOps Lead',
    inherentLikelihood: 2,
    inherentSeverity: 5,
    inherentScore: 10,
    residualLikelihood: 2,
    residualSeverity: 5,
    residualScore: 10,
    trend: 'increasing',
    controlIds: ['CTL-029'],
    affectedAgents: ['Trading Assistant', 'Portfolio Optimizer'],
    chainRisk: { cascadeScore: 78, blastRadius: 55, chainDepth: 2, humanGates: 1 },
    dateIdentified: '2026-04-01',
    lastReviewed: '2026-06-10',
    nextReview: '2026-06-25',
    notes: 'Kill switch implementation required before production',
  },
];

export const CONTROLS: Control[] = [
  {
    id: 'CTL-001',
    name: 'Bias testing on protected classes',
    description: 'Quarterly testing of model outputs across 7 protected classes with disparate impact analysis.',
    type: 'detective',
    category: 'bias-fairness',
    status: 'implemented',
    effectiveness: 'high',
    owner: 'RAI Council',
    evidence: 'Q1 2026 Bias Report',
    lastTested: '2026-04-15',
    riskIds: ['RSK-001'],
    frameworks: ['SR 26-2', 'ECOA', 'NIST AI RMF'],
  },
  {
    id: 'CTL-002',
    name: 'Fair lending monitoring dashboard',
    description: 'Real-time monitoring of approval rates, pricing, and terms across demographic segments.',
    type: 'detective',
    category: 'bias-fairness',
    status: 'implemented',
    effectiveness: 'high',
    owner: 'Fair Lending Team',
    evidence: 'Dashboard active',
    riskIds: ['RSK-001'],
    frameworks: ['ECOA', 'FHA'],
  },
  {
    id: 'CTL-003',
    name: 'Pre-deployment bias review gate',
    description: 'Mandatory bias review before any credit-impacting model goes to production.',
    type: 'preventive',
    category: 'bias-fairness',
    status: 'implemented',
    effectiveness: 'high',
    owner: 'RAI Council',
    evidence: 'Gate checklist v2.1',
    riskIds: ['RSK-001'],
    frameworks: ['SR 26-2', 'ISO 42001'],
  },
  {
    id: 'CTL-004',
    name: 'Dual-framework validation',
    description: 'All model outputs validated by both Bedrock evaluation and DeepEval frameworks.',
    type: 'detective',
    category: 'model-performance',
    status: 'implemented',
    effectiveness: 'high',
    owner: 'ML Platform',
    evidence: '99.2% agreement rate',
    lastTested: '2026-05-01',
    riskIds: ['RSK-002'],
    frameworks: ['SR 26-2', 'NIST AI RMF'],
  },
  {
    id: 'CTL-005',
    name: 'Hallucination detection guardrail',
    description: 'Bedrock Guardrails configured for hallucination detection with 0% threshold.',
    type: 'preventive',
    category: 'model-performance',
    status: 'implemented',
    effectiveness: 'high',
    owner: 'Platform',
    evidence: 'Guardrail config GR-004',
    riskIds: ['RSK-002'],
    frameworks: ['NIST AI RMF'],
  },
  {
    id: 'CTL-006',
    name: 'Grounding to knowledge base',
    description: 'Financial advice responses grounded to approved knowledge base with citation requirements.',
    type: 'preventive',
    category: 'model-performance',
    status: 'implemented',
    effectiveness: 'medium',
    owner: 'ML Platform',
    evidence: 'KB-Finance active',
    riskIds: ['RSK-002'],
    frameworks: ['NIST AI RMF'],
  },
  {
    id: 'CTL-007',
    name: 'PII detection and redaction',
    description: 'Bedrock Guardrails configured to detect and redact PII entities (SSN, account numbers, etc.).',
    type: 'preventive',
    category: 'privacy',
    status: 'implemented',
    effectiveness: 'high',
    owner: 'Platform',
    evidence: 'Guardrail config GR-001',
    riskIds: ['RSK-003'],
    frameworks: ['GLBA', 'CCPA', 'NYDFS 500'],
  },
  {
    id: 'CTL-008',
    name: 'Output logging with PII masking',
    description: 'All model outputs logged with automatic PII masking before storage.',
    type: 'preventive',
    category: 'privacy',
    status: 'implemented',
    effectiveness: 'high',
    owner: 'Platform',
    evidence: 'Langfuse config',
    riskIds: ['RSK-003'],
    frameworks: ['GLBA', 'SOC 2'],
  },
  {
    id: 'CTL-009',
    name: 'Input validation and sanitization',
    description: 'All user inputs validated and sanitized before model processing.',
    type: 'preventive',
    category: 'security',
    status: 'implemented',
    effectiveness: 'medium',
    owner: 'Security',
    evidence: 'Input filter v3',
    riskIds: ['RSK-004'],
    frameworks: ['NIST AI RMF', 'SOC 2'],
  },
  {
    id: 'CTL-010',
    name: 'Prompt injection detection',
    description: 'ML-based detection of prompt injection attempts with blocking.',
    type: 'detective',
    category: 'security',
    status: 'partial',
    effectiveness: 'medium',
    owner: 'Security',
    evidence: 'Detector v1.2 — 87% accuracy',
    lastTested: '2026-04-01',
    riskIds: ['RSK-004'],
    frameworks: ['NIST AI RMF'],
  },
  {
    id: 'CTL-011',
    name: 'Model performance monitoring',
    description: 'Continuous monitoring of model accuracy, latency, and error rates with alerting.',
    type: 'detective',
    category: 'model-performance',
    status: 'implemented',
    effectiveness: 'high',
    owner: 'Platform',
    evidence: 'CloudWatch dashboards',
    riskIds: ['RSK-005'],
    frameworks: ['SR 26-2', 'NIST AI RMF'],
  },
  {
    id: 'CTL-012',
    name: 'Drift detection alerts',
    description: 'Automated detection of data and concept drift with 2% threshold alerts.',
    type: 'detective',
    category: 'model-performance',
    status: 'implemented',
    effectiveness: 'high',
    owner: 'ML Platform',
    evidence: 'Drift monitor active',
    lastTested: '2026-05-15',
    riskIds: ['RSK-005'],
    frameworks: ['SR 26-2'],
  },
  {
    id: 'CTL-013',
    name: 'Model card documentation standard',
    description: 'Standardized model card template with mandatory fields for all production models.',
    type: 'preventive',
    category: 'compliance',
    status: 'partial',
    effectiveness: 'medium',
    owner: 'ML Platform',
    evidence: 'Template v2.0 — 80% adoption',
    riskIds: ['RSK-006'],
    frameworks: ['SR 26-2', 'ISO 42001', 'EU AI Act'],
  },
  {
    id: 'CTL-014',
    name: 'Vendor due diligence',
    description: 'Annual due diligence review of model vendors including security, compliance, and continuity.',
    type: 'preventive',
    category: 'third-party',
    status: 'implemented',
    effectiveness: 'medium',
    owner: 'Vendor Management',
    evidence: '2026 vendor reviews complete',
    lastTested: '2026-03-15',
    riskIds: ['RSK-007'],
    frameworks: ['SR 26-2', 'NYDFS 500'],
  },
  {
    id: 'CTL-015',
    name: 'Multi-vendor strategy',
    description: 'Maintain capability to switch between model providers to reduce single-vendor dependency.',
    type: 'corrective',
    category: 'third-party',
    status: 'implemented',
    effectiveness: 'medium',
    owner: 'ML Platform',
    evidence: 'Anthropic + Amazon active',
    riskIds: ['RSK-007'],
    frameworks: ['NIST AI RMF'],
  },
  {
    id: 'CTL-016',
    name: 'Explainability for credit decisions',
    description: 'LIME/SHAP explanations generated for all credit-impacting decisions.',
    type: 'preventive',
    category: 'compliance',
    status: 'partial',
    effectiveness: 'medium',
    owner: 'RAI Council',
    evidence: 'Pilot on Credit Risk agent',
    riskIds: ['RSK-008'],
    frameworks: ['ECOA', 'SR 26-2'],
  },
  {
    id: 'CTL-017',
    name: 'Budget alerts and throttling',
    description: 'AWS Budgets configured with alerts at 80%/90%/100% and automatic throttling.',
    type: 'preventive',
    category: 'financial',
    status: 'implemented',
    effectiveness: 'high',
    owner: 'FinOps',
    evidence: 'AWS Budgets config',
    riskIds: ['RSK-009'],
    frameworks: [],
  },
  {
    id: 'CTL-018',
    name: 'Token usage monitoring',
    description: 'Real-time monitoring of token consumption by agent, use case, and business unit.',
    type: 'detective',
    category: 'financial',
    status: 'implemented',
    effectiveness: 'high',
    owner: 'FinOps',
    evidence: 'FinOps dashboard',
    riskIds: ['RSK-009'],
    frameworks: [],
  },
  {
    id: 'CTL-019',
    name: 'Data quality validation',
    description: 'Automated data quality checks on all inputs to RAG knowledge bases.',
    type: 'preventive',
    category: 'data-quality',
    status: 'implemented',
    effectiveness: 'high',
    owner: 'Data Governance',
    evidence: 'DQ pipeline active',
    riskIds: ['RSK-010'],
    frameworks: ['ISO 42001', 'EU AI Act'],
  },
  {
    id: 'CTL-020',
    name: 'Knowledge base refresh cadence',
    description: 'Defined refresh schedules for all knowledge bases with staleness alerts.',
    type: 'preventive',
    category: 'data-quality',
    status: 'implemented',
    effectiveness: 'medium',
    owner: 'Data Governance',
    evidence: 'KB refresh schedule',
    riskIds: ['RSK-010'],
    frameworks: ['NIST AI RMF'],
  },
];

export const ISSUES: Issue[] = [
  {
    id: 'ISS-001',
    title: 'Prompt injection detector accuracy below target',
    description: 'Current detector accuracy at 87%, target is 95%. Red team found bypass techniques.',
    severity: 'high',
    status: 'in-progress',
    source: 'assessment',
    riskId: 'RSK-004',
    controlId: 'CTL-010',
    owner: 'T. Wilson',
    dueDate: '2026-07-01',
    dateIdentified: '2026-04-15',
    remediation: 'Upgrading to v2.0 detector with additional training data',
  },
  {
    id: 'ISS-002',
    title: 'Model card documentation incomplete for Nova models',
    description: 'Nova Pro and Nova Lite missing required sections: limitations, bias testing results.',
    severity: 'medium',
    status: 'in-progress',
    source: 'audit',
    riskId: 'RSK-006',
    controlId: 'CTL-013',
    owner: 'J. Martinez',
    dueDate: '2026-06-15',
    dateIdentified: '2026-05-01',
    remediation: 'Documentation sprint scheduled for June',
  },
  {
    id: 'ISS-003',
    title: 'Explainability not yet deployed for Credit Risk agent',
    description: 'ECOA adverse action notice requirement not fully met — explanations still in pilot.',
    severity: 'high',
    status: 'in-progress',
    source: 'self-identified',
    riskId: 'RSK-008',
    controlId: 'CTL-016',
    owner: 'S. Chen',
    dueDate: '2026-06-30',
    dateIdentified: '2026-03-01',
    remediation: 'Explainability module GA planned for June',
  },
  {
    id: 'ISS-004',
    title: 'User training completion below target',
    description: 'Only 65% of required users completed AI risk training, target is 100%.',
    severity: 'medium',
    status: 'open',
    source: 'assessment',
    owner: 'L&D Team',
    dueDate: '2026-07-15',
    dateIdentified: '2026-05-10',
    remediation: 'Mandatory training campaign launching June 1',
  },
  {
    id: 'ISS-005',
    title: 'EU AI Act transparency disclosure gaps',
    description: 'Consumer-facing AI transparency disclosures not yet implemented for 2 agents.',
    severity: 'medium',
    status: 'open',
    source: 'audit',
    riskId: 'RSK-006',
    owner: 'Product Team',
    dueDate: '2026-08-01',
    dateIdentified: '2026-04-01',
    remediation: 'UX designs in review, implementation Q3',
  },
];

export const ASSESSMENTS: Assessment[] = [
  {
    id: 'ASM-001',
    name: 'Q2 2026 Quarterly Risk Assessment',
    type: 'periodic',
    status: 'completed',
    scope: 'All production AI/ML systems',
    assessor: 'MRM Committee',
    startDate: '2026-04-01',
    completedDate: '2026-04-30',
    risksIdentified: 2,
    controlsEvaluated: 20,
    findings: 3,
  },
  {
    id: 'ASM-002',
    name: 'Nova Pro Initial Risk Assessment',
    type: 'initial',
    status: 'completed',
    scope: 'Nova Pro model deployment',
    assessor: 'ML Platform + RAI Council',
    startDate: '2026-02-15',
    completedDate: '2026-03-10',
    risksIdentified: 3,
    controlsEvaluated: 12,
    findings: 1,
  },
  {
    id: 'ASM-003',
    name: 'Sonnet 4.5 → 4.6 Upgrade Assessment',
    type: 'change-triggered',
    status: 'in-progress',
    scope: 'Sonnet version upgrade impact',
    assessor: 'ML Platform',
    startDate: '2026-05-20',
    risksIdentified: 0,
    controlsEvaluated: 8,
    findings: 0,
  },
  {
    id: 'ASM-004',
    name: 'Annual Comprehensive Risk Assessment',
    type: 'periodic',
    status: 'draft',
    scope: 'Enterprise AI/ML risk portfolio',
    assessor: 'MRM Committee + Internal Audit',
    startDate: '2026-07-01',
    risksIdentified: 0,
    controlsEvaluated: 0,
    findings: 0,
  },
];

// ─────────────────────────── Aggregations ───────────────────────────

export const getRiskStats = () => {
  const total = RISKS.length;
  const byStatus = {
    open: RISKS.filter(r => r.status === 'open').length,
    mitigated: RISKS.filter(r => r.status === 'mitigated').length,
    accepted: RISKS.filter(r => r.status === 'accepted').length,
    closed: RISKS.filter(r => r.status === 'closed').length,
  };
  const byCategory = RISK_CATEGORIES.map(cat => ({
    ...cat,
    count: RISKS.filter(r => r.category === cat.id).length,
    avgResidual: Math.round(RISKS.filter(r => r.category === cat.id).reduce((s, r) => s + r.residualScore, 0) / (RISKS.filter(r => r.category === cat.id).length || 1)),
  }));
  const critical = RISKS.filter(r => r.residualScore >= 20).length;
  const high = RISKS.filter(r => r.residualScore >= 15 && r.residualScore < 20).length;
  const avgResidual = Math.round(RISKS.reduce((s, r) => s + r.residualScore, 0) / total);
  const increasing = RISKS.filter(r => r.trend === 'increasing').length;

  return { total, byStatus, byCategory, critical, high, avgResidual, increasing };
};

export const getControlStats = () => {
  const total = CONTROLS.length;
  const implemented = CONTROLS.filter(c => c.status === 'implemented').length;
  const partial = CONTROLS.filter(c => c.status === 'partial').length;
  const effectiveness = {
    high: CONTROLS.filter(c => c.effectiveness === 'high').length,
    medium: CONTROLS.filter(c => c.effectiveness === 'medium').length,
    low: CONTROLS.filter(c => c.effectiveness === 'low').length,
  };

  return { total, implemented, partial, effectiveness };
};

export const getIssueStats = () => {
  const total = ISSUES.length;
  const open = ISSUES.filter(i => i.status === 'open').length;
  const inProgress = ISSUES.filter(i => i.status === 'in-progress').length;
  const critical = ISSUES.filter(i => i.severity === 'critical').length;
  const high = ISSUES.filter(i => i.severity === 'high').length;
  const overdue = ISSUES.filter(i => new Date(i.dueDate) < new Date() && i.status !== 'closed' && i.status !== 'remediated').length;

  return { total, open, inProgress, critical, high, overdue };
};

// ─────────────────────────── Agentic Risk Functions ───────────────────────────

export const getAgenticRiskStats = () => {
  const total = AGENTIC_RISKS.length;
  const byStatus = {
    open: AGENTIC_RISKS.filter(r => r.status === 'open').length,
    mitigated: AGENTIC_RISKS.filter(r => r.status === 'mitigated').length,
    accepted: AGENTIC_RISKS.filter(r => r.status === 'accepted').length,
    closed: AGENTIC_RISKS.filter(r => r.status === 'closed').length,
  };
  const byCategory = AGENTIC_RISK_CATEGORIES.map(cat => ({
    ...cat,
    count: AGENTIC_RISKS.filter(r => r.category === cat.id).length,
    avgResidual: Math.round(
      AGENTIC_RISKS.filter(r => r.category === cat.id)
        .reduce((s, r) => s + r.residualScore, 0) /
        (AGENTIC_RISKS.filter(r => r.category === cat.id).length || 1)
    ),
  }));
  const avgCascadeScore = Math.round(
    AGENTIC_RISKS.filter(r => r.chainRisk)
      .reduce((s, r) => s + (r.chainRisk?.cascadeScore || 0), 0) /
      (AGENTIC_RISKS.filter(r => r.chainRisk).length || 1)
  );
  const avgBlastRadius = Math.round(
    AGENTIC_RISKS.filter(r => r.chainRisk)
      .reduce((s, r) => s + (r.chainRisk?.blastRadius || 0), 0) /
      (AGENTIC_RISKS.filter(r => r.chainRisk).length || 1)
  );
  const noHumanGates = AGENTIC_RISKS.filter(r => r.chainRisk?.humanGates === 0).length;

  return { total, byStatus, byCategory, avgCascadeScore, avgBlastRadius, noHumanGates };
};

// ─────────────────────────── Real-Time Risk Monitoring ───────────────────────────

// Five-tier alert framework aligned with enterprise SOC
export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export const ALERT_THRESHOLDS: Record<AlertSeverity, { min: number; max: number; color: string; bgColor: string; action: string }> = {
  CRITICAL: { min: 90, max: 100, color: '#991b1b', bgColor: 'bg-red-100', action: 'Immediate escalation, potential kill switch' },
  HIGH: { min: 70, max: 89, color: '#c2410c', bgColor: 'bg-orange-100', action: 'P1 ticket, 15-min SLA' },
  MEDIUM: { min: 40, max: 69, color: '#a16207', bgColor: 'bg-amber-100', action: 'P2 ticket, 4-hour SLA' },
  LOW: { min: 10, max: 39, color: '#15803d', bgColor: 'bg-emerald-100', action: 'Monitor, review in daily standup' },
  INFO: { min: 0, max: 9, color: '#475569', bgColor: 'bg-slate-100', action: 'Log only, no action required' },
};

export const getAlertSeverity = (score: number): AlertSeverity => {
  if (score >= 90) return 'CRITICAL';
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  if (score >= 10) return 'LOW';
  return 'INFO';
};

// Risk score calculation: 0.25*capability + 0.25*autonomy + 0.30*behavior + 0.20*context
export const calculateRiskScore = (
  capability: number,
  autonomy: number,
  behavior: number,
  context: number
): number => Math.round(0.25 * capability + 0.25 * autonomy + 0.30 * behavior + 0.20 * context);

// Blast radius formula: (downstream_agents*2 + data_stores*3 + external_apis*2 + iam_permissions*1.5) * (1 - human_gates*0.2)
export const calculateBlastRadius = (
  downstreamAgents: number,
  dataStores: number,
  externalApis: number,
  iamPermissions: number,
  humanGates: number
): number => {
  const raw = downstreamAgents * 2 + dataStores * 3 + externalApis * 2 + iamPermissions * 1.5;
  const mitigation = 1 - Math.min(humanGates * 0.2, 0.8);
  return Math.round(raw * mitigation);
};

// Cascade risk: base_risk * (1.15 ^ chain_depth)
export const calculateCascadeRisk = (baseRisk: number, chainDepth: number): number =>
  Math.round(baseRisk * Math.pow(1.15, chainDepth));

// Trust degradation: initial_trust * (0.9 ^ boundary_crossings)
export const calculateTrustDegradation = (initialTrust: number, boundaryCrossings: number): number =>
  Math.round(initialTrust * Math.pow(0.9, boundaryCrossings));

// Mock real-time monitoring data for dashboard
export type RuntimeSignal = {
  id: string;
  timestamp: string;
  agentId: string;
  agentName: string;
  signalType: 'anomaly' | 'threshold' | 'pattern' | 'circuit_breaker' | 'trust_violation';
  severity: AlertSeverity;
  riskScore: number;
  description: string;
  metrics?: {
    capability?: number;
    autonomy?: number;
    behavior?: number;
    context?: number;
  };
  chainContext?: {
    cascadeScore: number;
    blastRadius: number;
    chainDepth: number;
    humanGates: number;
  };
  status: 'active' | 'acknowledged' | 'resolved' | 'suppressed';
  awsIntegration?: {
    cloudwatchAlarmArn?: string;
    securityHubFindingId?: string;
    eventBridgeRuleArn?: string;
  };
};

export const RUNTIME_SIGNALS: RuntimeSignal[] = [
  {
    id: 'SIG-001',
    timestamp: '2026-06-17T14:32:15Z',
    agentId: 'fraud-classifier',
    agentName: 'Fraud Classifier',
    signalType: 'threshold',
    severity: 'HIGH',
    riskScore: 76,
    description: 'Tool invocation rate exceeded threshold (45/min vs 20/min limit)',
    metrics: { capability: 72, autonomy: 65, behavior: 92, context: 70 },
    chainContext: { cascadeScore: 68, blastRadius: 35, chainDepth: 3, humanGates: 2 },
    status: 'active',
    awsIntegration: { cloudwatchAlarmArn: 'arn:aws:cloudwatch:us-east-1:123456789012:alarm:fraud-tool-rate' },
  },
  {
    id: 'SIG-002',
    timestamp: '2026-06-17T14:28:42Z',
    agentId: 'cs-agent',
    agentName: 'Customer Service Agent',
    signalType: 'anomaly',
    severity: 'MEDIUM',
    riskScore: 53,
    description: 'Unusual pattern in refund tool usage - 3x normal volume',
    metrics: { capability: 45, autonomy: 55, behavior: 68, context: 38 },
    chainContext: { cascadeScore: 42, blastRadius: 15, chainDepth: 2, humanGates: 1 },
    status: 'acknowledged',
    awsIntegration: { cloudwatchAlarmArn: 'arn:aws:cloudwatch:us-east-1:123456789012:alarm:cs-refund-anomaly' },
  },
  {
    id: 'SIG-003',
    timestamp: '2026-06-17T14:15:08Z',
    agentId: 'comp-analyzer',
    agentName: 'Compliance Analyzer',
    signalType: 'trust_violation',
    severity: 'CRITICAL',
    riskScore: 92,
    description: 'Agent attempted access to secrets without approval chain completion',
    metrics: { capability: 88, autonomy: 95, behavior: 98, context: 85 },
    chainContext: { cascadeScore: 92, blastRadius: 65, chainDepth: 4, humanGates: 3 },
    status: 'active',
    awsIntegration: {
      cloudwatchAlarmArn: 'arn:aws:cloudwatch:us-east-1:123456789012:alarm:comp-trust-violation',
      securityHubFindingId: 'arn:aws:securityhub:us-east-1:123456789012:security-control/Agent.TrustViolation',
    },
  },
  {
    id: 'SIG-004',
    timestamp: '2026-06-17T13:58:33Z',
    agentId: 'fraud-analyst',
    agentName: 'Deep Analyst',
    signalType: 'circuit_breaker',
    severity: 'HIGH',
    riskScore: 75,
    description: 'Circuit breaker triggered: 3 consecutive hallucination detections',
    metrics: { capability: 70, autonomy: 72, behavior: 85, context: 68 },
    chainContext: { cascadeScore: 72, blastRadius: 40, chainDepth: 3, humanGates: 1 },
    status: 'resolved',
    awsIntegration: { eventBridgeRuleArn: 'arn:aws:events:us-east-1:123456789012:rule/fraud-circuit-breaker' },
  },
  {
    id: 'SIG-005',
    timestamp: '2026-06-17T13:42:17Z',
    agentId: 'trading-assistant',
    agentName: 'Trading Assistant',
    signalType: 'pattern',
    severity: 'MEDIUM',
    riskScore: 59,
    description: 'Repeated attempts to exceed autonomy threshold without human confirmation',
    metrics: { capability: 60, autonomy: 78, behavior: 52, context: 45 },
    chainContext: { cascadeScore: 78, blastRadius: 55, chainDepth: 2, humanGates: 1 },
    status: 'acknowledged',
  },
  {
    id: 'SIG-006',
    timestamp: '2026-06-17T12:15:00Z',
    agentId: 'cs-router',
    agentName: 'Intent Router',
    signalType: 'anomaly',
    severity: 'LOW',
    riskScore: 25,
    description: 'Minor latency increase in routing decisions (150ms vs 100ms baseline)',
    metrics: { capability: 20, autonomy: 25, behavior: 30, context: 22 },
    chainContext: { cascadeScore: 28, blastRadius: 8, chainDepth: 1, humanGates: 0 },
    status: 'suppressed',
  },
];

export const getRuntimeSignalStats = () => {
  const total = RUNTIME_SIGNALS.length;
  const active = RUNTIME_SIGNALS.filter(s => s.status === 'active').length;
  const acknowledged = RUNTIME_SIGNALS.filter(s => s.status === 'acknowledged').length;
  const bySeverity = {
    CRITICAL: RUNTIME_SIGNALS.filter(s => s.severity === 'CRITICAL').length,
    HIGH: RUNTIME_SIGNALS.filter(s => s.severity === 'HIGH').length,
    MEDIUM: RUNTIME_SIGNALS.filter(s => s.severity === 'MEDIUM').length,
    LOW: RUNTIME_SIGNALS.filter(s => s.severity === 'LOW').length,
    INFO: RUNTIME_SIGNALS.filter(s => s.severity === 'INFO').length,
  };
  const avgRiskScore = Math.round(RUNTIME_SIGNALS.reduce((s, sig) => s + sig.riskScore, 0) / total);
  const withAwsIntegration = RUNTIME_SIGNALS.filter(s => s.awsIntegration).length;

  return { total, active, acknowledged, bySeverity, avgRiskScore, withAwsIntegration };
};
