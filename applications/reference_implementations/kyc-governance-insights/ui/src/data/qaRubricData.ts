export interface QARubricDimension {
  id: string;
  name: string;
  weight: number;
  description: string;
}

export interface QAReview {
  id: string;
  decisionId: string;
  customerName: string;
  reviewedAt: string;
  trigger: 'auto_sample' | 'manual' | 'event_triggered';
  overallScore: number;
  overallLabel: 'Excellent' | 'Good' | 'Adequate' | 'Below Standard' | 'Insufficient';
  dimensions: QADimensionResult[];
  justification: string;
  flagged: boolean;
  impactOnAutonomy: string;
}

export interface QADimensionResult {
  dimensionId: string;
  score: number;
  label: string;
  justification: string;
}

export const rubricDimensions: QARubricDimension[] = [
  { id: 'reasoning-completeness', name: 'Reasoning Completeness', weight: 25, description: 'Did the agent consider all relevant factors?' },
  { id: 'conclusion-soundness', name: 'Conclusion Soundness', weight: 25, description: 'Does conclusion logically follow from evidence?' },
  { id: 'evidence-sufficiency', name: 'Evidence Sufficiency', weight: 20, description: 'Is there enough evidence for this confidence?' },
  { id: 'bias-fairness', name: 'Bias & Fairness', weight: 15, description: 'Are there patterns suggesting disparate impact?' },
  { id: 'explanation-clarity', name: 'Explanation Clarity', weight: 15, description: 'Would a regulator find this convincing and clear?' },
];

export const qaReviews: QAReview[] = [
  {
    id: 'QA-001', decisionId: 'CUST-001', customerName: 'Acme Corporation Ltd', reviewedAt: '2026-06-27T07:00:00Z', trigger: 'auto_sample',
    overallScore: 4.8, overallLabel: 'Excellent', flagged: false, impactOnAutonomy: '+1 toward level-up (848/1000)',
    justification: 'Exemplary decision. Thorough analysis, well-evidenced, clear conclusion. Suitable as training example.',
    dimensions: [
      { dimensionId: 'reasoning-completeness', score: 5, label: 'Excellent', justification: 'All KYC factors addressed: identity, sanctions, PEP, financial health, ownership.' },
      { dimensionId: 'conclusion-soundness', score: 5, label: 'Excellent', justification: 'APPROVE conclusion fully supported by low risk score and clean checks.' },
      { dimensionId: 'evidence-sufficiency', score: 5, label: 'Excellent', justification: '4 source documents, all cross-referenced, hash-verified.' },
      { dimensionId: 'bias-fairness', score: 4, label: 'Good', justification: 'No bias detected. Geographic origin mentioned factually.' },
      { dimensionId: 'explanation-clarity', score: 5, label: 'Excellent', justification: 'Clear summary, structured reasoning, regulator-ready language.' },
    ],
  },
  {
    id: 'QA-002', decisionId: 'CUST-039', customerName: 'Meridian Logistics GmbH', reviewedAt: '2026-06-27T06:30:00Z', trigger: 'auto_sample',
    overallScore: 3.4, overallLabel: 'Adequate', flagged: true, impactOnAutonomy: 'Expanded sampling triggered (next 10 logistics-sector decisions)',
    justification: 'Decision PASSED all automated evaluators (grounding 92%, hallucination 97%) but qualitative review reveals reasoning gaps specific to logistics/trade corridor context. Agent applied generic KYC template rather than sector-appropriate analysis.',
    dimensions: [
      { dimensionId: 'reasoning-completeness', score: 3, label: 'Adequate', justification: 'Noted geographic risk (Germany-Turkey corridor) but did not explore trade-based money laundering indicators despite logistics sector.' },
      { dimensionId: 'conclusion-soundness', score: 4, label: 'Good', justification: 'APPROVE is defensible but confidence level arguably too high for logistics company with this corridor.' },
      { dimensionId: 'evidence-sufficiency', score: 3, label: 'Adequate', justification: 'Financial statements present but no trade flow analysis. For logistics, transaction patterns matter more than balance sheet.' },
      { dimensionId: 'bias-fairness', score: 4, label: 'Good', justification: 'No disparate treatment detected.' },
      { dimensionId: 'explanation-clarity', score: 3, label: 'Adequate', justification: 'Grammatically clear but lacks sector-specific risk discussion a regulator would expect.' },
    ],
  },
  {
    id: 'QA-003', decisionId: 'CUST-042', customerName: 'Nordic Capital Partners', reviewedAt: '2026-06-27T05:15:00Z', trigger: 'auto_sample',
    overallScore: 4.5, overallLabel: 'Good', flagged: false, impactOnAutonomy: '+1 toward level-up (849/1000)',
    justification: 'Strong analysis of complex PE fund structure. Minor improvement opportunity in condition specificity.',
    dimensions: [
      { dimensionId: 'reasoning-completeness', score: 5, label: 'Excellent', justification: 'Comprehensive PE fund analysis including fund structure, LP composition, and portfolio risk.' },
      { dimensionId: 'conclusion-soundness', score: 4, label: 'Good', justification: 'APPROVE with enhanced monitoring appropriate though condition specifics could be stronger.' },
      { dimensionId: 'evidence-sufficiency', score: 5, label: 'Excellent', justification: 'Fund docs, LP agreements, and regulatory filings all present and verified.' },
      { dimensionId: 'bias-fairness', score: 4, label: 'Good', justification: 'Nordic origin handled appropriately without blanket assumptions.' },
      { dimensionId: 'explanation-clarity', score: 4, label: 'Good', justification: 'Well-structured but could benefit from explicit risk appetite statement.' },
    ],
  },
];
