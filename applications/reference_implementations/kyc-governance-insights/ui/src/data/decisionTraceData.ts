export interface TraceStep {
  id: string;
  offsetMs: number;
  component: 'cedar' | 'guardrail' | 'model' | 'tool' | 'decision' | 'request';
  label: string;
  status: 'pass' | 'fail' | 'warn' | 'info';
  detail: string;
  latencyMs: number;
  children?: TraceStep[];
}

export interface DecisionTrace {
  id: string;
  customerId: string;
  customerName: string;
  decision: 'APPROVE' | 'REJECT' | 'ESCALATE';
  totalLatencyMs: number;
  totalTokens: number;
  costUsd: number;
  steps: TraceStep[];
}

export const decisionTraces: DecisionTrace[] = [
  {
    id: 'trace-001', customerId: 'CUST-001', customerName: 'Acme Corporation Ltd',
    decision: 'APPROVE', totalLatencyMs: 560, totalTokens: 2847, costUsd: 0.043,
    steps: [
      { id: 's1', offsetMs: 0, component: 'request', label: 'Request received (CUST-001)', status: 'info', detail: 'KYC full assessment, standard CDD path', latencyMs: 12 },
      { id: 's2', offsetMs: 12, component: 'cedar', label: 'Cedar Policy: ALLOW', status: 'pass', detail: 'Policy: kyc-standard-cdd — risk threshold not exceeded', latencyMs: 3 },
      { id: 's3', offsetMs: 45, component: 'guardrail', label: 'Bedrock Guardrail: PASS', status: 'pass', detail: 'No PII in prompt, no injection detected, topic filter pass', latencyMs: 30 },
      { id: 's4', offsetMs: 120, component: 'model', label: 'Claude Sonnet 4.5 — Sanctions reasoning', status: 'pass', detail: 'Tokens: 1,240 | Confidence: 0.97', latencyMs: 220, children: [
        { id: 's4a', offsetMs: 150, component: 'tool', label: 'sanctions_database_lookup("Acme Corp")', status: 'pass', detail: 'Result: NO_MATCH (0 hits)', latencyMs: 45 },
        { id: 's4b', offsetMs: 200, component: 'tool', label: 'pep_screening("Directors", jurisdiction="UK")', status: 'pass', detail: 'Result: CLEAR (0 PEP associations)', latencyMs: 38 },
      ]},
      { id: 's5', offsetMs: 340, component: 'cedar', label: 'Cedar Policy: ALLOW', status: 'pass', detail: 'Proceed to risk scoring — no forbid rules triggered', latencyMs: 2 },
      { id: 's6', offsetMs: 380, component: 'model', label: 'Nova Pro — Risk classification', status: 'pass', detail: 'risk_score=22, tier=LOW | Tokens: 680', latencyMs: 140 },
      { id: 's7', offsetMs: 520, component: 'cedar', label: 'Cedar Policy: ALLOW (auto-approve)', status: 'pass', detail: 'Score 22 < threshold 50 — auto-approve permitted', latencyMs: 2 },
      { id: 's8', offsetMs: 540, component: 'guardrail', label: 'Bedrock Guardrail: PASS (output)', status: 'pass', detail: 'Grounding check: 94% claims supported by source docs', latencyMs: 18 },
      { id: 's9', offsetMs: 555, component: 'decision', label: 'Decision: APPROVE', status: 'pass', detail: 'Autonomous approval (L2). No HITL required.', latencyMs: 5 },
    ],
  },
  {
    id: 'trace-047', customerId: 'CUST-047', customerName: 'Omega Trading Ltd',
    decision: 'REJECT', totalLatencyMs: 1240, totalTokens: 4891, costUsd: 0.072,
    steps: [
      { id: 'b1', offsetMs: 0, component: 'request', label: 'Request received (CUST-047)', status: 'info', detail: 'KYC full assessment, enhanced due diligence path', latencyMs: 15 },
      { id: 'b2', offsetMs: 15, component: 'cedar', label: 'Cedar Policy: ALLOW (initial)', status: 'pass', detail: 'Standard entry — no pre-block conditions met', latencyMs: 3 },
      { id: 'b3', offsetMs: 50, component: 'guardrail', label: 'Bedrock Guardrail: PASS (input)', status: 'pass', detail: 'Input clean, no injection detected in submitted documents', latencyMs: 32 },
      { id: 'b4', offsetMs: 150, component: 'model', label: 'Claude Sonnet 4.5 — Sanctions reasoning', status: 'warn', detail: 'OFAC SDN partial match detected (78%) | Tokens: 2,100', latencyMs: 380, children: [
        { id: 'b4a', offsetMs: 200, component: 'tool', label: 'sanctions_database_lookup("Omega Trading")', status: 'warn', detail: 'OFAC SDN: 78% match (Petrov, V. SDN-28934)', latencyMs: 52 },
        { id: 'b4b', offsetMs: 280, component: 'tool', label: 'pep_screening("Viktor Petrov")', status: 'warn', detail: 'PEP Level 2 association confirmed', latencyMs: 44 },
        { id: 'b4c', offsetMs: 350, component: 'tool', label: 'adverse_media_check("Omega Trading")', status: 'warn', detail: '3 regulatory investigations (Cyprus, 2024)', latencyMs: 65 },
      ]},
      { id: 'b5', offsetMs: 530, component: 'cedar', label: 'Cedar Policy: DENY (ORG-001)', status: 'fail', detail: 'FORBID: sanctions_match > 70% threshold — HARD BLOCK', latencyMs: 2 },
      { id: 'b6', offsetMs: 550, component: 'cedar', label: 'Cedar Policy: DENY (pep-escalation)', status: 'fail', detail: 'FORBID: PEP score 0.82 > 0.6 — escalation required', latencyMs: 2 },
      { id: 'b7', offsetMs: 600, component: 'model', label: 'Claude Sonnet 4.5 — SAR generation', status: 'pass', detail: 'SAR narrative generated | Tokens: 1,890', latencyMs: 520 },
      { id: 'b8', offsetMs: 1120, component: 'guardrail', label: 'Bedrock Guardrail: INTERVENE (PII)', status: 'warn', detail: 'PII detected in SAR narrative — redacted before logging', latencyMs: 25 },
      { id: 'b9', offsetMs: 1200, component: 'decision', label: 'Decision: REJECT (BLOCKED)', status: 'fail', detail: 'Cedar ORG-001 BLOCK enforced. SAR filed: REF-SAR-2026-0412', latencyMs: 40 },
    ],
  },
];

export const traceSummary = {
  avgLatencyMs: 680,
  avgTokens: 3100,
  costPerDecision: 0.047,
  guardrailTriggerRate: 2.3,
};
