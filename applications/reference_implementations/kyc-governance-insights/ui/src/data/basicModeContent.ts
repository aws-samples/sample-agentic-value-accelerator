export interface StepContent {
  id: number;
  label: string;
  icon: string;
  /** Optional high-level, scenario-agnostic description shown under the step title. */
  overview?: string;
  /** Optional per-agent explanation (prompt + what the tool returned), scenario-specific. */
  agentPrompts?: {
    creditAnalyst: { approve: string; block: string };
    complianceOfficer: { approve: string; block: string };
  };
  /** Optional supervisor/governance explanation for later steps, scenario-specific. */
  supervisorNote?: { approve: string; block: string };
  narrativeApprove: string;
  narrativeBlock: string;
  conversationApprove: Array<{ agent: 'credit-analyst' | 'compliance-officer' | 'supervisor'; text: string }>;
  conversationBlock: Array<{ agent: 'credit-analyst' | 'compliance-officer' | 'supervisor'; text: string }>;
  activeControls: string[];
  riskUpdatesApprove: Record<string, number>;
  riskUpdatesBlock: Record<string, number>;
  telemetryApprove: string[];
  telemetryBlock: string[];
}

export const BASIC_STEPS: StepContent[] = [
  {
    id: 1, label: 'Customer Profile Ingestion', icon: '📥',
    overview: 'The arbiter launches two specialist agents in parallel. Each reasons with a large language model in Amazon Bedrock, then calls a tool to fetch the customer profile from the data store — the shared starting point for both assessments.',
    agentPrompts: {
      creditAnalyst: {
        approve: 'Prompted to judge financial standing and prudent exposure, the Credit Analyst first fetches the profile. It returns Acme Corporation Ltd — a US (Delaware) manufacturer, corporate account, $50M–$100M revenue, with clean directors and a straightforward ownership split.',
        block: 'Prompted to judge financial standing and prudent exposure, the Credit Analyst first fetches the profile. It returns Omega Trading Ltd — a 3-year-old London metals/commodities trader requesting a £2.5M trade-finance facility, wholly owned by a BVI holding company.',
      },
      complianceOfficer: {
        approve: 'Prompted to screen for regulatory risk, the Compliance Officer first fetches the profile. It returns Acme’s ownership and directors: two non-PEP directors, three beneficial owners, no risk flags — a clean, low-complexity structure.',
        block: 'Prompted to screen for regulatory risk, the Compliance Officer first fetches the profile. It returns Omega’s structure: a BVI parent, two nominee directors, a PEP director, and pre-set risk flags (sanctions_potential_match, bvi_holding, pep_l3, adverse_media).',
      },
    },
    narrativeApprove: 'Gathering corporate filings, director appointments, and financial statements for Acme Corporation Ltd from Companies House and credit bureaus.',
    narrativeBlock: 'Gathering corporate filings and ownership records for Omega Trading Ltd. Complex BVI nominee structure detected — triggering enhanced due diligence path.',
    conversationApprove: [
      { agent: 'credit-analyst', text: 'Pulling 3 years of financials from Companies House and Experian. Revenue, balance sheet, and cash flow for Acme Corporation Ltd.' },
      { agent: 'compliance-officer', text: 'Requesting director list, beneficial ownership structure, and incorporation history. Cross-referencing against our database.' },
    ],
    conversationBlock: [
      { agent: 'credit-analyst', text: 'Pulling financials for Omega Trading Ltd. BVI-registered, Cyprus operations. Requesting offshore structure documentation.' },
      { agent: 'compliance-officer', text: 'High-risk jurisdiction flags: BVI incorporation, Cyprus operations. Triggering enhanced due diligence pathway.' },
    ],
    activeControls: ['guardrails-in', 'policy-engine'],
    riskUpdatesApprove: { accuracy: 0, security: 95, compliance: 55, product: 0, legal: 25 },
    riskUpdatesBlock: { accuracy: 0, security: 95, compliance: 55, product: 0, legal: 25 },
    telemetryApprove: ['Document OCR: 99.4% confidence (Amazon Textract)', 'PII detected: 2 entities redacted before processing'],
    telemetryBlock: ['Document OCR: 98.1% confidence (Amazon Textract)', 'BVI registration detected — enhanced path triggered', 'PII detected: 4 entities redacted'],
  },
  {
    id: 2, label: 'Additional Data Ingestion', icon: '🤖',
    overview: 'With profiles in hand, each agent fetches its specialist dataset — the Credit Analyst pulls credit history, the Compliance Officer pulls the compliance record — reasoning over each result before continuing.',
    agentPrompts: {
      creditAnalyst: {
        approve: 'The Credit Analyst fetches credit history. It returns a strong picture for Acme: credit score 750 (rating A), 48 of 50 payments on time, and healthy 2025 financials (revenue $60M, net income $8.5M).',
        block: 'The Credit Analyst fetches credit history. It returns a weak picture for Omega: credit score 610 (rating BB), thin 24-payment record, and stretched financials (revenue £5M, net income just £150k, liabilities £5.2M vs £6.2M assets).',
      },
      complianceOfficer: {
        approve: 'The Compliance Officer fetches the compliance record. Acme comes back clear: sanctions, PEP, and adverse-media screens all clean across OFAC/UN/EU/HMT, AML rating low, no enhanced due diligence required.',
        block: 'The Compliance Officer fetches the compliance record. Omega comes back critical: a 92% OFSI sanctions match on its UBO, a Level-3 PEP director, adverse-media findings, and AML rating "critical" with EDD required.',
      },
    },
    narrativeApprove: 'Resolving the people behind Acme — matching each beneficial owner’s identity and date of birth against Companies House and electoral-roll records. All 3 UBOs confirmed clean.',
    narrativeBlock: 'Resolving the people behind Omega — matching each beneficial owner’s identity and date of birth against registry records. Viktor Petrov flagged — nationality match triggers additional screening.',
    conversationApprove: [
      { agent: 'compliance-officer', text: 'Beneficial owners resolved and verified against government databases — name and date-of-birth match, no adverse media on initial screen.' },
      { agent: 'supervisor', text: 'UBO identity verification clean. No flags. Moving to risk assessment.' },
    ],
    conversationBlock: [
      { agent: 'compliance-officer', text: 'Director Viktor Petrov flagged — nationality match triggers additional screening databases.' },
      { agent: 'supervisor', text: 'Enhanced screening activated for Petrov. Proceeding with caution.' },
    ],
    activeControls: ['deterministic', 'guardrails-in'],
    riskUpdatesApprove: { accuracy: 0, security: 96, compliance: 58, product: 0, legal: 35 },
    riskUpdatesBlock: { accuracy: 0, security: 96, compliance: 58, product: 0, legal: 35 },
    telemetryApprove: ['Companies House: MATCH ✓', 'UBO DOB match: 3/3 ✓', 'Beneficial owners: 3 confirmed, all clean'],
    telemetryBlock: ['Companies House: BVI — limited records', 'UBO DOB: 2 nominees, unverifiable', 'Enhanced screening triggered for Petrov'],
  },
  {
    id: 3, label: 'Transaction History Ingestion', icon: '🔍',
    overview: 'Both agents fetch the same transaction history — their final data source — to check money-flow patterns against everything gathered so far.',
    agentPrompts: {
      creditAnalyst: {
        approve: 'The Credit Analyst reads Acme’s transactions: ~2,400 payments, £45M inflow / £42M outflow, mostly domestic (70%), no suspicious patterns — consistent with a healthy, active trading business.',
        block: 'The Credit Analyst reads Omega’s transactions: just 45 payments yet a £5M turnover claim, 85% international, flagged pattern "new_entity_high_turnover_claim" — the money flow does not match the story.',
      },
      complianceOfficer: {
        approve: 'The Compliance Officer reads the same transactions: no high-risk jurisdictions and no suspicious patterns, confirming the low-risk profile from a money-laundering standpoint.',
        block: 'The Compliance Officer reads the same transactions: counterparties in high-risk jurisdictions (BVI, Cyprus correspondent banks) — reinforcing the layered-opacity and ML-risk concerns.',
      },
    },
    narrativeApprove: 'Calculating composite risk score. Score: 22/100 (LOW). All sanctions and PEP checks clear. No adverse media.',
    narrativeBlock: 'Calculating composite risk score. Score: 81/100 (CRITICAL). OFAC SDN partial match detected at 92% confidence. PEP Level 3 association confirmed.',
    conversationApprove: [
      { agent: 'credit-analyst', text: 'Debt-to-equity 0.42, current ratio 2.1, revenue growth 12% YoY. Financial health indicators are strong.' },
      { agent: 'compliance-officer', text: 'UK jurisdiction, standard sector. No enhanced due diligence triggers. Country risk: LOW.' },
      { agent: 'supervisor', text: 'Composite risk score: 22/100 (LOW). Both assessments align. Proceeding.' },
    ],
    conversationBlock: [
      { agent: 'credit-analyst', text: 'Revenue pattern unusual — 340% growth in 18 months with no headcount increase. Flagging.' },
      { agent: 'compliance-officer', text: 'Multi-jurisdictional structure with 3 layers of beneficial ownership. Country risk: HIGH.' },
      { agent: 'supervisor', text: 'Composite risk score: 81/100 (CRITICAL). Escalating checks.' },
    ],
    activeControls: ['deterministic', 'guardrails-out', 'grounding'],
    riskUpdatesApprove: { accuracy: 60, security: 96, compliance: 62, product: 40, legal: 45 },
    riskUpdatesBlock: { accuracy: 60, security: 96, compliance: 62, product: 40, legal: 45 },
    telemetryApprove: ['OFAC/UN/EU/HMT: CLEAR ✓', 'PEP database: NO MATCH ✓', 'Risk score: 22/100 (LOW)'],
    telemetryBlock: ['⚠ OFAC SDN: 92% match (Viktor Petrov)', '⚠ PEP Level 3 association confirmed', '⚠ Risk score: 81/100 (CRITICAL)'],
  },
  {
    id: 4, label: 'Specialist Assessment', icon: '📊',
    overview: 'With no more data to fetch, each agent’s model stops calling tools and produces its final answer — a single verdict handed back to the supervisor.',
    agentPrompts: {
      creditAnalyst: {
        approve: 'The Credit Analyst finalises and returns its verdict to the supervisor: LOW financial risk — D/E 0.33, current ratio 2.1x, 96% on-time payments. Creditworthy on standard terms.',
        block: 'The Credit Analyst finalises and returns its verdict to the supervisor: HIGH financial risk — D/E 5.43 (extreme leverage), current ratio 0.8, wafer-thin margins. Elevated exposure.',
      },
      complianceOfficer: {
        approve: 'The Compliance Officer finalises and returns its compliance status to the supervisor: COMPLIANT — sanctions, PEP, and adverse-media all clear; no enhanced due diligence required.',
        block: 'The Compliance Officer finalises and returns its compliance status to the supervisor: NON-COMPLIANT — 92% sanctions match, Level-3 PEP, adverse media. Enhanced due diligence mandatory.',
      },
    },
    narrativeApprove: 'Financial analysis complete. D/E ratio 0.33 (healthy), current ratio 2.1x (strong). Lambda validator independently confirmed all figures.',
    narrativeBlock: 'Financial analysis flagged. D/E ratio 5.43 (extreme leverage), payment history 62% (poor). Numbers independently verified as accurate — the company IS high risk.',
    conversationApprove: [
      { agent: 'credit-analyst', text: 'No related-party transaction concerns. Payment history clean — 98.7% on-time over 36 months. Recommending STANDARD credit terms.' },
      { agent: 'supervisor', text: 'Credit assessment complete. No amber indicators. Forwarding to compliance gate.' },
    ],
    conversationBlock: [
      { agent: 'credit-analyst', text: 'D/E ratio 5.43 — extreme leverage. Payment history 62%. Numbers verified as accurate — company IS high risk.' },
      { agent: 'supervisor', text: 'Financial indicators confirm elevated risk. Proceeding to compliance gate with HIGH flag.' },
    ],
    activeControls: ['llm-judge', 'grounding', 'guardrails-out'],
    riskUpdatesApprove: { accuracy: 78, security: 97, compliance: 68, product: 65, legal: 60 },
    riskUpdatesBlock: { accuracy: 78, security: 97, compliance: 65, product: 55, legal: 55 },
    telemetryApprove: ['D/E: 0.33 ✓ | Current: 2.1x ✓', 'Lambda validator: all ratios confirmed ✓', 'LLM-Judge quality: 0.95 ✓'],
    telemetryBlock: ['D/E: 5.43 ⚠ (threshold: < 3.0)', 'Payment history: 62% ⚠ (threshold: > 90%)', 'Lambda validator: numbers accurate — risk IS real'],
  },
  {
    id: 5, label: 'Overall Assessment', icon: '⚖️',
    overview: 'The supervisor now takes over. It consumes both specialists’ verdicts and makes one further model call — with no tools — to reconcile them into a single, structured KYC assessment.',
    supervisorNote: {
      approve: 'The supervisor merges the Credit Analyst’s LOW-risk verdict with the Compliance Officer’s COMPLIANT status. The findings align, so the model synthesises a coherent low-risk assessment (composite score 22/100) recommending approval.',
      block: 'The supervisor merges the Credit Analyst’s HIGH-risk verdict with the Compliance Officer’s NON-COMPLIANT status. Both point the same way, so the model synthesises a critical-risk assessment (composite score 81/100) flagging the sanctions and PEP hits.',
    },
    narrativeApprove: 'All 19 Cedar policies evaluated. Result: ALLOW — no FORBID fired. Risk score 22 is below the 80 hard-block (APP-006). Bounded autonomy permitted.',
    narrativeBlock: 'Cedar policy ORG-003: DENY. Sanctions match 92% exceeds the 85 hard-block threshold. Agent is FORBIDDEN from proceeding. Mandatory human escalation.',
    conversationApprove: [
      { agent: 'compliance-officer', text: 'Sanctions screening: 0 matches across OFAC, EU, UN, HMT lists. PEP check: 0 matches. Adverse media: 0 findings.' },
      { agent: 'supervisor', text: 'All clear. No escalation triggers. Policy engine authorises auto-approval at this risk tier.' },
    ],
    conversationBlock: [
      { agent: 'compliance-officer', text: '⛔ SANCTIONS HIT: Director Viktor Petrov matches OFAC SDN List (ID: OFAC-2024-8831). Confidence: 92%. Hard block.' },
      { agent: 'supervisor', text: '⛔ Sanctions match confirmed. Policy engine returns DENY. Cannot proceed. Escalating to human review.' },
    ],
    activeControls: ['policy-engine', 'deterministic', 'llm-judge', 'guardrails-out', 'grounding', 'automated-reasoning'],
    riskUpdatesApprove: { accuracy: 88, security: 97, compliance: 85, product: 80, legal: 75 },
    riskUpdatesBlock: { accuracy: 85, security: 97, compliance: 28, product: 35, legal: 40 },
    telemetryApprove: ['Cedar DEFAULT-001: ALLOW (no FORBID) ✓', 'Risk 22 < 80 hard-block APP-006 ✓', 'Grounding: 94% ✓'],
    telemetryBlock: ['⛔ Cedar ORG-003: FORBID (sanctions 92 > 85)', '⛔ Cedar ORG-004: FORBID (PEP level 3 ≥ 3)', 'Agent BLOCKED — cannot override'],
  },
  {
    id: 6, label: 'Automated and Human Oversight', icon: '👤',
    overview: 'The supervisor’s assessment is a recommendation, not the verdict. It now hands off to a deterministic governance layer — non-AI code that independently re-checks the case before any decision is committed: it recomputes the financial ratios from the raw data, re-runs sanctions and PEP screening, and evaluates a three-layer policy cascade (most-restrictive-wins).',
    supervisorNote: {
      approve: 'The deterministic checks all pass: recomputed ratios match the agent’s figures, sanctions/PEP screens are clear, and no policy gate fires. With risk 22 below the review threshold, the case is cleared for auto-approval — no human review required.',
      block: 'The deterministic checks confirm the risk: recomputed ratios verify the weak financials, and the sanctions screen re-confirms the 92% OFSI match — tripping the ORG-003 sanctions hard-block rule (and the £2.5M facility also breaches the ORG-001 amount ceiling). This forces mandatory MLRO escalation for human review.',
    },
    narrativeApprove: 'Low risk — human review NOT required. Agent has earned Tier 2 autonomy (847/1000 clean decisions). Selected for post-decision QA sampling (10%).',
    narrativeBlock: 'MANDATORY human escalation triggered. MLRO (Money Laundering Reporting Officer) must review. Suspicious Activity Report being generated automatically.',
    conversationApprove: [
      { agent: 'supervisor', text: 'Risk score 22/100 is below the 65-point threshold for mandatory human review. Auto-approval authorised per policy KYC-AUTO-001.' },
    ],
    conversationBlock: [
      { agent: 'supervisor', text: '⚠️ Mandatory human review required. Sanctions match detected. Awaiting your decision.' },
    ],
    activeControls: ['hitl', 'guardrails-out'],
    riskUpdatesApprove: { accuracy: 92, security: 97, compliance: 90, product: 88, legal: 85 },
    riskUpdatesBlock: { accuracy: 85, security: 97, compliance: 28, product: 35, legal: 40 },
    telemetryApprove: ['HITL: Not required (low risk) ✓', 'Autonomy: Tier 2 earned (97.3% track record)', 'QA: selected for review (10% sample)'],
    telemetryBlock: ['⚠ HITL: TRIGGERED (mandatory)', '⚠ MLRO notification sent', '⚠ SAR auto-generated: REF-SAR-2026-0412'],
  },
  {
    id: 7, label: 'Decision & Audit', icon: '✅',
    overview: 'The final decision is now committed — and, just as importantly, fully evidenced.',
    supervisorNote: {
      approve: 'Decision: APPROVE. Acme cleared every gate — strong financials, clean sanctions/PEP/adverse-media screens, and a low composite risk (22/100) below the auto-approve threshold. The complete reasoning chain has been recorded as an immutable audit trail, and every evidence artefact behind the decision — the data retrieved, the checks run, the policies evaluated — has been retained and is ready for regulatory inspection.',
      block: 'Decision: BLOCK. Omega was stopped by a decisive gate — a 92% OFSI sanctions match on its beneficial owner, above the 85 hard-block threshold (ORG-003), compounded by a Level-3 PEP (ORG-004) and high leverage. A Suspicious Activity Report was filed, the full reasoning chain recorded as an immutable audit trail, and every evidence artefact behind the decision retained and sealed for regulatory inspection.',
    },
    narrativeApprove: 'APPROVED. Full audit trail recorded — 34 reasoning steps, 9 tool calls, 3 policy checks. Evidence pack generated. Immutable. Regulator-ready.',
    narrativeBlock: 'BLOCKED. Application rejected. SAR filed with FCA/NCA. Full evidence pack generated. All reasoning preserved for regulatory inspection.',
    conversationApprove: [
      { agent: 'supervisor', text: 'Decision: APPROVE. Full audit trail generated — 47 evidence artefacts, 12 data sources, 3 independent checks. Case closed.' },
    ],
    conversationBlock: [
      { agent: 'supervisor', text: 'Decision: BLOCK. Sanctions match confirmed by reviewer. SAR filing reference created. Evidence pack sealed.' },
    ],
    activeControls: ['policy-engine', 'deterministic', 'guardrails-out', 'registry'],
    riskUpdatesApprove: { accuracy: 97, security: 98, compliance: 96, product: 94, legal: 96 },
    riskUpdatesBlock: { accuracy: 85, security: 97, compliance: 28, product: 35, legal: 45 },
    telemetryApprove: ['✅ Decision: APPROVE', 'Audit: 34 reasoning steps, 9 tools, 3 policies', 'Evidence pack: immutable, exportable'],
    telemetryBlock: ['⛔ Decision: REJECT (BLOCKED)', 'SAR filed: REF-SAR-2026-0412', 'Evidence pack: 42 reasoning steps — full reasoning chain'],
  },
];

export interface ControlDef {
  id: string;
  name: string;
  explanation: string;
  awsService: string;
  icon: string;
}

export const CONTROLS: ControlDef[] = [
  { id: 'guardrails-in', name: 'Guardrails (Input)', explanation: 'Blocks prompt injection, jailbreaks, and off-topic requests before the agent sees them', awsService: 'Amazon Bedrock Guardrails', icon: '🛡️' },
  { id: 'guardrails-out', name: 'Guardrails (Output)', explanation: 'Catches PII, harmful content, and hallucinated claims before they reach the user', awsService: 'Amazon Bedrock Guardrails', icon: '🛡️' },
  { id: 'deterministic', name: 'Deterministic Checks', explanation: 'Non-AI code independently recalculates — if numbers don\'t match, block', awsService: 'AWS Lambda (AgentCore)', icon: '🔢' },
  { id: 'llm-judge', name: 'LLM-as-Judge', explanation: 'A separate AI model scores output for quality, faithfulness, and completeness', awsService: 'Amazon Bedrock (Claude)', icon: '⚖️' },
  { id: 'policy-engine', name: 'Policy Engine', explanation: 'External authorisation — can this agent do this action on this data? Yes/No/Escalate', awsService: 'Verified Permissions (Cedar)', icon: '📋' },
  { id: 'automated-reasoning', name: 'Automated Reasoning', explanation: 'Mathematical proof that claims are grounded in source documents', awsService: 'Bedrock Automated Reasoning', icon: '🧮' },
  { id: 'grounding', name: 'Contextual Grounding', explanation: 'Verifies factual claims against source documents — provably correct', awsService: 'Bedrock Grounding Check', icon: '📐' },
  { id: 'registry', name: 'Agent Registry', explanation: 'Every agent has a tier, permissions, and accountable human owner', awsService: 'Amazon Bedrock AgentCore', icon: '📇' },
  { id: 'hitl', name: 'Human-in-the-Loop', explanation: 'Human reviews and approves before final decision executes', awsService: 'AWS Step Functions', icon: '👤' },
];

export const RISK_DIALS = [
  { id: 'accuracy', label: 'Accuracy' },
  { id: 'security', label: 'Security' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'product', label: 'Product Risk' },
  { id: 'legal', label: 'Legal' },
];
