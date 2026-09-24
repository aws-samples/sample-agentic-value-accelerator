export interface EvidenceEntry {
  id: string;
  timestamp: string;
  type: 'decision' | 'policy_change' | 'intervention' | 'audit' | 'qa_review' | 'alert';
  title: string;
  agent: string;
  details: Record<string, string | number>;
  severity: 'info' | 'warning' | 'critical';
  actions: string[];
}

export const evidenceTrailData: EvidenceEntry[] = [
  { id: 'evt-001', timestamp: '2026-06-27T07:53:58Z', type: 'decision', title: 'Decision: CUST001 APPROVED (Acme Corp)', agent: 'KYC Assessment', details: { profile: 'Balanced (L2)', documents: 4, grounding: '98.1%', policies: '12/12 pass' }, severity: 'info', actions: ['view_trace', 'download'] },
  { id: 'evt-001a', timestamp: '2026-06-27T07:53:55Z', type: 'audit', title: 'Grounding Verification: CUST001 — 94% grounded', agent: 'Bedrock Guardrails', details: { groundingScore: '94%', relevanceScore: '88%', sourceDocs: 'CoI, Financials, UBO Declaration', verdict: 'GROUNDED' }, severity: 'info', actions: ['view_trace'] },
  { id: 'evt-002', timestamp: '2026-06-27T07:52:30Z', type: 'policy_change', title: 'Profile switched: Balanced → Progressive', agent: 'System', details: { user: 'admin', reason: 'Testing progressive mode', hitlRate: '25% → 10%', threshold: '5000 → 25000' }, severity: 'warning', actions: ['view_diff', 'revert'] },
  { id: 'evt-003', timestamp: '2026-06-27T07:45:12Z', type: 'intervention', title: 'Demotion: L2 → L1 (auto-triggered)', agent: 'Governance', details: { trigger: '3 consecutive false positives', previous: 'L2 Supervised', new: 'L1 Restricted' }, severity: 'warning', actions: ['view_trigger'] },
  { id: 'evt-004', timestamp: '2026-06-27T07:30:00Z', type: 'audit', title: 'Evidence Pack #47 generated', agent: 'Audit Agent', details: { completeness: '94%', missing: 'Adverse media refresh (>7 days stale)', packSize: '2.3 MB' }, severity: 'info', actions: ['download', 'view_gaps'] },
  { id: 'evt-005', timestamp: '2026-06-27T07:15:00Z', type: 'qa_review', title: 'Sample batch assessed (5 decisions)', agent: 'QA Research', details: { excellent: 4, adequate: 1, poor: 0, sample: 'Batch 2026-W26-003' }, severity: 'info', actions: ['view_rubric'] },
  { id: 'evt-006', timestamp: '2026-06-27T06:45:00Z', type: 'decision', title: 'Decision: CUST047 REJECTED (Omega Trading)', agent: 'KYC Assessment', details: { profile: 'Balanced (L2)', sanctions: '78% OFAC match', decision: 'BLOCK', sarFiled: 'REF-SAR-2026-0412' }, severity: 'critical', actions: ['view_trace', 'download'] },
  { id: 'evt-007', timestamp: '2026-06-27T06:30:00Z', type: 'alert', title: 'Token budget at 72% (normal range)', agent: 'System', details: { used: '864K', budget: '1.2M', trend: 'stable' }, severity: 'info', actions: [] },
  { id: 'evt-008', timestamp: '2026-06-27T06:15:00Z', type: 'decision', title: 'Decision: CUST012 APPROVED (Standard)', agent: 'KYC Assessment', details: { profile: 'Balanced (L2)', riskScore: 18, grounding: '97.3%', latency: '34s' }, severity: 'info', actions: ['view_trace'] },
  { id: 'evt-009', timestamp: '2026-06-27T05:45:00Z', type: 'policy_change', title: 'Cedar policy updated: kyc-confidence-threshold', agent: 'System', details: { user: 'admin', change: 'threshold 0.85 → 0.80', reason: 'Reducing false escalations' }, severity: 'warning', actions: ['view_diff', 'revert'] },
  { id: 'evt-010', timestamp: '2026-06-27T05:30:00Z', type: 'decision', title: 'Decision: CUST089 ESCALATED (PEP match)', agent: 'KYC Assessment', details: { profile: 'Balanced (L2)', pepScore: 0.91, escalatedTo: 'MLRO', reason: 'PEP Level 1' }, severity: 'warning', actions: ['view_trace'] },
  { id: 'evt-011', timestamp: '2026-06-27T05:15:00Z', type: 'alert', title: 'HITL queue depth increasing (4 pending)', agent: 'Governance', details: { pending: 4, sla: '2h', oldest: '45 min' }, severity: 'warning', actions: [] },
  { id: 'evt-012', timestamp: '2026-06-27T04:30:00Z', type: 'audit', title: 'Evidence Pack #46 generated', agent: 'Audit Agent', details: { completeness: '100%', missing: 'None', packSize: '3.1 MB' }, severity: 'info', actions: ['download'] },
  { id: 'evt-013', timestamp: '2026-06-27T04:00:00Z', type: 'qa_review', title: 'Overnight QA batch (12 decisions)', agent: 'QA Research', details: { excellent: 10, adequate: 2, poor: 0, sample: 'Batch 2026-W26-002' }, severity: 'info', actions: ['view_rubric'] },
  { id: 'evt-014', timestamp: '2026-06-27T03:00:00Z', type: 'intervention', title: 'Auto-tighten: HITL rate 20% → 30%', agent: 'Governance', details: { trigger: 'Accuracy dipped below 93% threshold', duration: '2h (auto-reverts if improved)' }, severity: 'warning', actions: ['view_trigger'] },
  { id: 'evt-015', timestamp: '2026-06-27T02:00:00Z', type: 'decision', title: 'Decision: CUST023 ESCALATED (Low confidence)', agent: 'KYC Assessment', details: { profile: 'Balanced (L2)', confidence: 0.72, reason: 'Below 0.85 threshold', escalatedTo: 'Credit Committee' }, severity: 'info', actions: ['view_trace'] },
  { id: 'evt-016', timestamp: '2026-06-27T01:00:00Z', type: 'alert', title: 'Model latency spike detected (p95: 5.8s)', agent: 'System', details: { normal: '4.2s', current: '5.8s', threshold: '6.0s', cause: 'Bedrock throttling' }, severity: 'warning', actions: [] },
];
