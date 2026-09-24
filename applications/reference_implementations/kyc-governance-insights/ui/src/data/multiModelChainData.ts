export interface ModelChainStep {
  id: string;
  model: string;
  role: string;
  color: string;
  gateAfter: boolean;
  gateType?: 'cedar' | 'guardrail';
  gateStatus: 'pass' | 'block' | 'na';
}

export const modelChainSteps: ModelChainStep[] = [
  { id: 'step1', model: 'Claude Sonnet 4.5', role: 'Reasoning & Analysis', color: '#3b82f6', gateAfter: true, gateType: 'cedar', gateStatus: 'pass' },
  { id: 'step2', model: 'Amazon Nova Pro', role: 'Classification & Routing', color: '#8b5cf6', gateAfter: true, gateType: 'cedar', gateStatus: 'pass' },
  { id: 'step3', model: 'Claude Haiku 3.5', role: 'Summarisation', color: '#10b981', gateAfter: true, gateType: 'guardrail', gateStatus: 'pass' },
];
