export interface Evaluator {
  id: string;
  name: string;
  category: 'accuracy' | 'safety' | 'compliance' | 'quality' | 'performance';
  description: string;
  threshold: number;
  currentScore: number;
  trend: number[];
  passRate: number;
  lastRun: string;
  status: 'passing' | 'warning' | 'failing';
  gateType: 'hard' | 'soft';
  awsService: string;
  regulatoryRef?: string;
}

export const evaluators: Evaluator[] = [
  { id: 'grounding', name: 'Contextual Grounding', category: 'accuracy', description: 'Measures % of output claims supported by source documents', threshold: 0.85, currentScore: 0.94, trend: [0.91,0.93,0.92,0.94,0.93,0.95,0.94,0.93,0.94,0.94,0.93,0.94,0.95,0.94,0.93,0.94,0.94,0.95,0.94,0.94], passRate: 97.2, lastRun: '2026-06-27T08:15:00Z', status: 'passing', gateType: 'hard', awsService: 'Bedrock Knowledge Bases', regulatoryRef: 'FCA SYSC 6.1.1' },
  { id: 'hallucination', name: 'Hallucination Detection', category: 'accuracy', description: 'Detects fabricated entities, dates, or financial figures', threshold: 0.95, currentScore: 0.98, trend: [0.97,0.98,0.97,0.98,0.99,0.98,0.97,0.98,0.98,0.99,0.98,0.97,0.98,0.98,0.99,0.98,0.98,0.97,0.98,0.98], passRate: 99.1, lastRun: '2026-06-27T08:15:00Z', status: 'passing', gateType: 'hard', awsService: 'Bedrock Guardrails', regulatoryRef: 'MLR 2017 Reg 28' },
  { id: 'toxicity', name: 'Toxicity & Bias', category: 'safety', description: 'Screens for discriminatory language and protected characteristic bias', threshold: 0.99, currentScore: 1.0, trend: [1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,0.99,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0], passRate: 100, lastRun: '2026-06-27T08:15:00Z', status: 'passing', gateType: 'hard', awsService: 'Bedrock Guardrails', regulatoryRef: 'Equality Act 2010' },
  { id: 'pii-leakage', name: 'PII Leakage Prevention', category: 'safety', description: 'Ensures no PII appears in outputs or logs beyond authorized scope', threshold: 0.99, currentScore: 0.99, trend: [1.0,1.0,0.99,1.0,1.0,1.0,0.99,1.0,1.0,1.0,0.99,1.0,1.0,1.0,1.0,0.99,1.0,1.0,1.0,0.99], passRate: 99.8, lastRun: '2026-06-27T08:15:00Z', status: 'passing', gateType: 'hard', awsService: 'Bedrock Guardrails', regulatoryRef: 'UK DPA 2018 Art 5' },
  { id: 'regulatory-adherence', name: 'Regulatory Adherence', category: 'compliance', description: 'Checks output references correct regulations (MLR 2017, FATF, FCA)', threshold: 0.90, currentScore: 0.96, trend: [0.94,0.95,0.96,0.95,0.96,0.96,0.95,0.96,0.97,0.96,0.95,0.96,0.96,0.97,0.96,0.96,0.95,0.96,0.96,0.96], passRate: 98.4, lastRun: '2026-06-27T08:15:00Z', status: 'passing', gateType: 'soft', awsService: 'AgentCore Evaluations', regulatoryRef: 'FCA COBS 2.1' },
  { id: 'evidence-sufficiency', name: 'Evidence Sufficiency', category: 'compliance', description: 'Validates decision has minimum required evidence', threshold: 0.80, currentScore: 0.91, trend: [0.88,0.89,0.90,0.89,0.91,0.90,0.89,0.91,0.90,0.91,0.90,0.91,0.92,0.91,0.90,0.91,0.91,0.92,0.91,0.91], passRate: 95.6, lastRun: '2026-06-27T08:15:00Z', status: 'passing', gateType: 'soft', awsService: 'AgentCore Evaluations', regulatoryRef: 'MLR 2017 Reg 27' },
  { id: 'reasoning-coherence', name: 'Reasoning Coherence', category: 'quality', description: 'LLM-as-Judge scoring of logical consistency', threshold: 0.75, currentScore: 0.88, trend: [0.85,0.86,0.87,0.86,0.88,0.87,0.86,0.88,0.87,0.88,0.87,0.88,0.89,0.88,0.87,0.88,0.88,0.89,0.88,0.88], passRate: 94.1, lastRun: '2026-06-27T08:15:00Z', status: 'passing', gateType: 'soft', awsService: 'AgentCore Evaluations' },
  { id: 'decision-consistency', name: 'Decision Consistency', category: 'quality', description: 'Flags decisions deviating >2 sigma from historical pattern', threshold: 0.70, currentScore: 0.82, trend: [0.78,0.80,0.79,0.81,0.80,0.82,0.81,0.80,0.82,0.81,0.82,0.81,0.83,0.82,0.81,0.82,0.82,0.83,0.82,0.82], passRate: 91.3, lastRun: '2026-06-27T08:15:00Z', status: 'passing', gateType: 'soft', awsService: 'AgentCore Evaluations' },
  { id: 'latency-sla', name: 'Latency SLA', category: 'performance', description: 'Decision completes within 60s SLA (p95)', threshold: 0.95, currentScore: 0.92, trend: [0.94,0.93,0.92,0.93,0.91,0.92,0.93,0.92,0.91,0.92,0.93,0.92,0.91,0.92,0.92,0.91,0.92,0.93,0.92,0.92], passRate: 88.7, lastRun: '2026-06-27T08:15:00Z', status: 'warning', gateType: 'soft', awsService: 'CloudWatch', regulatoryRef: 'Internal SLA' },
  { id: 'cost-efficiency', name: 'Cost per Decision', category: 'performance', description: 'Tracks token cost vs budget, flags 2x overspend', threshold: 0.85, currentScore: 0.91, trend: [0.89,0.90,0.91,0.90,0.91,0.92,0.91,0.90,0.91,0.91,0.92,0.91,0.90,0.91,0.91,0.92,0.91,0.91,0.90,0.91], passRate: 93.5, lastRun: '2026-06-27T08:15:00Z', status: 'passing', gateType: 'soft', awsService: 'CloudWatch' },
];

export const categories = ['accuracy', 'safety', 'compliance', 'quality', 'performance'] as const;
export const categoryLabels: Record<string, string> = { accuracy: 'Accuracy', safety: 'Safety', compliance: 'Compliance', quality: 'Quality', performance: 'Performance' };
export const categoryColors: Record<string, string> = { accuracy: '#06b6d4', safety: '#ef4444', compliance: '#8b5cf6', quality: '#f59e0b', performance: '#10b981' };
