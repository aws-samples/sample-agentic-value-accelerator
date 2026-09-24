export interface EvidencePack {
  id: string;
  generatedAt: string;
  scope: string;
  seniorManager: string;
  completenessScore: number;
  missingItems: string[];
  sections: EvidenceSection[];
}

export interface EvidenceSection {
  id: string;
  title: string;
  status: 'complete' | 'partial' | 'missing';
  items: string[];
  regulatoryRef: string;
}

export const sampleEvidencePack: EvidencePack = {
  id: 'PACK-2026-047',
  generatedAt: '2026-06-27T08:30:00Z',
  scope: 'Single Decision: CUST-001 (Acme Corporation Ltd)',
  seniorManager: 'Sarah Thompson, Head of Financial Crime (SMF16)',
  completenessScore: 94,
  missingItems: ['Adverse media refresh (>7 days stale)', 'Secondary source verification pending'],
  sections: [
    { id: 'decision-summary', title: '1. Decision Summary', status: 'complete', items: ['Decision: APPROVED', 'Risk Score: 22/100 (LOW)', 'Agent: KYC Assessment (Autonomy Level 2)', 'Senior Manager: Sarah Thompson (SMF16)', 'Date: 2026-06-27T07:53:58Z', 'Processing Time: 43 seconds'], regulatoryRef: 'FCA SYSC 6.1.1' },
    { id: 'input-evidence', title: '2. Input Evidence & Lineage', status: 'complete', items: ['Certificate of Incorporation (SHA-256: a3f2...)', 'Financial Statements FY2025 (SHA-256: b7c1...)', 'UBO Declaration (SHA-256: d4e9...)', 'Transaction History (SHA-256: f1a8...)', 'Document extraction: Amazon Textract (deterministic)', 'All documents verified against Companies House'], regulatoryRef: 'MLR 2017 Reg 28(2)' },
    { id: 'ai-processing', title: '3. AI Processing Trace', status: 'complete', items: ['Model: Claude Sonnet 4.5 (Bedrock, us-east-1)', 'Reasoning chain: 7 steps, all logged', 'Tool calls: 12 (all authorized by Cedar)', 'Temperature: 0 (deterministic)', 'Tokens: 4,218 input / 1,892 output'], regulatoryRef: 'FCA PS24/16' },
    { id: 'cedar-evaluation', title: '4. Cedar Policy Evaluations', status: 'complete', items: ['Policies evaluated: 12/12', 'Forbid triggered: 0', 'Permit granted: Action::approve_customer', 'Profile active: Balanced (L2)', 'Value threshold: \u00A35,000 (within bounds)', 'Risk threshold: 50 (score: 22)'], regulatoryRef: 'ISO 42001 Annex B' },
    { id: 'evaluator-results', title: '5. Evaluator Pipeline Results', status: 'complete', items: ['Hard gates: 4/4 passed (Grounding 94%, Hallucination 98%, Toxicity 100%, PII 99%)', 'Soft gates: 6/6 passed', 'Overall quality: 94.2%', 'Evidence Sufficiency: 91%', 'No evaluator failures \u2014 no HITL triggered'], regulatoryRef: 'CRI Profile v2.0' },
    { id: 'human-oversight', title: '6. Human Oversight Record', status: 'complete', items: ['HITL required: NO (risk below threshold)', 'QA sampled: YES (10% random, non-blocking)', 'QA result: Excellent (4.8/5.0)', 'Autonomy: L2 (847 clean decisions)', 'Override: None'], regulatoryRef: 'FCA PRIN 2A.5' },
    { id: 'completeness', title: '7. Completeness Assessment', status: 'partial', items: ['Completeness: 94% (target: 95%)', 'Missing: Adverse media refresh (8 days old, policy: 7 days)', 'Missing: Secondary source verification (API timeout)', 'Recommendation: Re-run adverse media before submission', 'Auto-scheduled: refresh queued (next 15 min)'], regulatoryRef: 'MLR 2017 Reg 28(11)' },
  ],
};
