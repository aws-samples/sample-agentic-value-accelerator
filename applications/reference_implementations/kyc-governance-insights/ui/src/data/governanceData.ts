export interface TierCard {
  tier: number;
  label: string;
  title: string;
  description: string;
  requirement: string;
  borderColor: string;
  labelColor: string;
}

export interface EvalDimension {
  label: string;
  value: string;
  numericValue: number;
  description: string;
  colorClass: string;
}

export const tierCards: TierCard[] = [
  { tier: 1, label: 'Tier 1 — Supervised', title: '100% HITL', description: 'Agent assists with data gathering. All decisions require human review.', requirement: '✓ Current for high-risk', borderColor: '#36b37e', labelColor: '#36b37e' },
  { tier: 2, label: 'Tier 2 — Bounded', title: 'Low-risk auto-approved', description: 'Agent auto-clears score <30. Medium/high escalated.', requirement: 'Req: 5,000 sessions, >97%', borderColor: '#ff991f', labelColor: '#ff991f' },
  { tier: 3, label: 'Tier 3 — Autonomous', title: 'Most cases autonomous', description: 'Only PEP, >$50K, anomalies escalate.', requirement: 'Req: 50,000 sessions, zero incidents', borderColor: '#0052CC', labelColor: '#0052CC' },
  { tier: 4, label: 'Tier 4 — Multi-Agent', title: 'Cross-org coordination', description: 'Full lifecycle across teams.', requirement: 'Future — board approval', borderColor: '#8993a4', labelColor: '#8993a4' },
];

export const evalDimensions: EvalDimension[] = [
  { label: '1. Task Completion', value: '94.7%', numericValue: 94.7, description: 'KYC assessment end-to-end', colorClass: 'mv-green' },
  { label: '2. Planning', value: '91.2%', numericValue: 91.2, description: 'Correct steps in right order', colorClass: 'mv-green' },
  { label: '3. Tool Use', value: '98.3%', numericValue: 98.3, description: 'Correct APIs & parameters', colorClass: 'mv-green' },
  { label: '4. Memory', value: '87.5%', numericValue: 87.5, description: 'Context retention accuracy', colorClass: 'mv-orange' },
  { label: '5. Ops & RAI', value: '96.1%', numericValue: 96.1, description: 'SLA, cost, bias, PII', colorClass: 'mv-green' },
  { label: '6. KYC-Specific', value: '93.8%', numericValue: 93.8, description: 'Risk weighting, UBO ID', colorClass: 'mv-green' },
];
