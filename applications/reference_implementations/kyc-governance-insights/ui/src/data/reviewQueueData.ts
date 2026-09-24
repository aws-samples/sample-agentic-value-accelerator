export interface ReviewItem {
  id: string;
  customerId: string;
  customerName: string;
  riskScore: number;
  triggerType: 'risk_threshold' | 'hard_gate' | 'pep_match' | 'manual_escalation';
  triggerReason: string;
  agentRecommendation: 'approve' | 'reject' | 'approve_with_conditions';
  reasoningSummary: string;
  status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'escalated';
  createdAt: string;
  slaDeadline: string;
  assignedTo: string | null;
  evaluatorResults: { name: string; score: number; passed: boolean }[];
  cedarPoliciesTriggered: string[];
  sourceDocuments: string[];
  waitForTaskToken: string;
}

export const initialReviewQueue: ReviewItem[] = [
  {
    id: 'REV-047', customerId: 'CUST-047', customerName: 'Omega Trading Ltd', riskScore: 73,
    triggerType: 'risk_threshold', triggerReason: 'Risk score 73 exceeds Balanced profile threshold (50)',
    agentRecommendation: 'approve_with_conditions',
    reasoningSummary: 'Strong financials but geographic risk flag from high-risk jurisdiction. PEP clear, sanctions clear.',
    status: 'pending', createdAt: '2026-06-27T07:28:00Z', slaDeadline: '2026-06-27T09:28:00Z', assignedTo: null,
    evaluatorResults: [{ name: 'Grounding', score: 0.91, passed: true },{ name: 'Hallucination', score: 0.97, passed: true },{ name: 'Toxicity', score: 1.0, passed: true },{ name: 'PII', score: 1.0, passed: true },{ name: 'Regulatory', score: 0.93, passed: true },{ name: 'Evidence', score: 0.88, passed: true },{ name: 'Reasoning', score: 0.82, passed: true },{ name: 'Consistency', score: 0.71, passed: true },{ name: 'Latency', score: 0.89, passed: false },{ name: 'Cost', score: 0.94, passed: true }],
    cedarPoliciesTriggered: ['kyc-confidence-threshold'], sourceDocuments: ['Certificate of Incorporation', 'Financial Statements FY2025', 'UBO Declaration', 'Geographic Risk Assessment'], waitForTaskToken: 'tok-sf-2026-047-abc123',
  },
  {
    id: 'REV-051', customerId: 'CUST-051', customerName: 'Chen Wei Investments', riskScore: 45,
    triggerType: 'pep_match', triggerReason: 'PEP match: Director linked to politically exposed person (tier 2)',
    agentRecommendation: 'approve_with_conditions',
    reasoningSummary: 'Low financial risk (score 22), clean sanctions. PEP flag: Director is nephew of municipal-level official. Tier 2 PEP — enhanced monitoring recommended.',
    status: 'pending', createdAt: '2026-06-27T07:13:00Z', slaDeadline: '2026-06-27T09:13:00Z', assignedTo: null,
    evaluatorResults: [{ name: 'Grounding', score: 0.96, passed: true },{ name: 'Hallucination', score: 0.99, passed: true },{ name: 'Toxicity', score: 1.0, passed: true },{ name: 'PII', score: 0.99, passed: true },{ name: 'Regulatory', score: 0.97, passed: true },{ name: 'Evidence', score: 0.94, passed: true },{ name: 'Reasoning', score: 0.91, passed: true },{ name: 'Consistency', score: 0.85, passed: true },{ name: 'Latency', score: 0.95, passed: true },{ name: 'Cost', score: 0.92, passed: true }],
    cedarPoliciesTriggered: ['kyc-pep-escalation'], sourceDocuments: ['Certificate of Incorporation', 'UBO Declaration', 'PEP Screening Report', 'EDD Report'], waitForTaskToken: 'tok-sf-2026-051-def456',
  },
  {
    id: 'REV-052', customerId: 'CUST-052', customerName: 'Baltic Shipping Co', riskScore: 61,
    triggerType: 'hard_gate', triggerReason: 'Hard gate: Grounding score 0.82 below threshold 0.85',
    agentRecommendation: 'reject',
    reasoningSummary: 'Multiple inconsistencies in financial data. Revenue figure contradicts filed accounts. Agent flags potential document manipulation.',
    status: 'pending', createdAt: '2026-06-27T07:42:00Z', slaDeadline: '2026-06-27T09:42:00Z', assignedTo: null,
    evaluatorResults: [{ name: 'Grounding', score: 0.82, passed: false },{ name: 'Hallucination', score: 0.95, passed: true },{ name: 'Toxicity', score: 1.0, passed: true },{ name: 'PII', score: 1.0, passed: true },{ name: 'Regulatory', score: 0.90, passed: true },{ name: 'Evidence', score: 0.72, passed: false },{ name: 'Reasoning', score: 0.78, passed: true },{ name: 'Consistency', score: 0.65, passed: false },{ name: 'Latency', score: 0.91, passed: false },{ name: 'Cost', score: 0.88, passed: true }],
    cedarPoliciesTriggered: ['kyc-hallucination-guard'], sourceDocuments: ['Certificate of Incorporation', 'Financial Statements FY2025', 'Bank Statements', 'Adverse Media Report'], waitForTaskToken: 'tok-sf-2026-052-ghi789',
  },
  // Additional items that appear when profile is Conservative
  {
    id: 'REV-053', customerId: 'CUST-053', customerName: 'Green Valley Homes', riskScore: 35,
    triggerType: 'risk_threshold', triggerReason: 'Risk score 35 exceeds Conservative threshold (30)',
    agentRecommendation: 'approve', reasoningSummary: 'Standard UK residential developer. Clean checks. Low risk.',
    status: 'pending', createdAt: '2026-06-27T06:50:00Z', slaDeadline: '2026-06-27T08:50:00Z', assignedTo: null,
    evaluatorResults: [{ name: 'Grounding', score: 0.97, passed: true },{ name: 'Hallucination', score: 0.99, passed: true }],
    cedarPoliciesTriggered: ['kyc-max-auto-approve'], sourceDocuments: ['Certificate', 'Financials'], waitForTaskToken: 'tok-sf-2026-053',
  },
  {
    id: 'REV-054', customerId: 'CUST-054', customerName: 'Mercury Logistics', riskScore: 28,
    triggerType: 'risk_threshold', triggerReason: 'All decisions require review in Conservative mode',
    agentRecommendation: 'approve', reasoningSummary: 'UK-based logistics company. All checks pass.',
    status: 'pending', createdAt: '2026-06-27T06:30:00Z', slaDeadline: '2026-06-27T08:30:00Z', assignedTo: null,
    evaluatorResults: [{ name: 'Grounding', score: 0.95, passed: true }],
    cedarPoliciesTriggered: [], sourceDocuments: ['Certificate', 'Financials'], waitForTaskToken: 'tok-sf-2026-054',
  },
  {
    id: 'REV-055', customerId: 'CUST-055', customerName: 'Phoenix Capital', riskScore: 42,
    triggerType: 'risk_threshold', triggerReason: 'Risk score 42 exceeds Conservative threshold (30)',
    agentRecommendation: 'approve_with_conditions', reasoningSummary: 'Investment firm. Moderate complexity. No red flags.',
    status: 'pending', createdAt: '2026-06-27T06:15:00Z', slaDeadline: '2026-06-27T08:15:00Z', assignedTo: null,
    evaluatorResults: [{ name: 'Grounding', score: 0.93, passed: true }],
    cedarPoliciesTriggered: ['kyc-confidence-threshold'], sourceDocuments: ['Certificate', 'Financials', 'UBO'], waitForTaskToken: 'tok-sf-2026-055',
  },
];
