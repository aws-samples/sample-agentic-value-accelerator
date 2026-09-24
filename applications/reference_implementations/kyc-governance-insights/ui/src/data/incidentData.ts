// =============================================================================
// incidentData.ts — Iteration 25: Material Incidents & Near-Misses
// 2 incidents + 5 near-misses with realistic FSI scenarios
// =============================================================================

export type IncidentSeverity = 'HIGH' | 'MEDIUM' | 'LOW';
export type IncidentStatus = 'under_investigation' | 'contained' | 'resolved';

export interface TimelineEntry {
  time: string;
  action: string;
}

export interface Incident {
  id: string;
  date: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  useCase: string;
  impact: string;
  rootCause: string;
  containment: string;
  eta?: string;
  timeline: TimelineEntry[];
}

export interface NearMiss {
  id: string;
  date: string;
  title: string;
  controlType: string; // 'Cedar' | 'Guardrail' | 'Autonomy gate' | 'Drift detector'
  useCase: string;
}

// --- Incidents ---

export const incidents: Incident[] = [
  {
    id: 'INC-2026-012',
    date: '2026-06-15',
    title: 'Mortgage model drift detected',
    severity: 'HIGH',
    status: 'under_investigation',
    useCase: 'Mortgage',
    impact: '23 decisions flagged for manual review',
    rootCause: 'Training data distribution shift (Q2 housing market volatility)',
    containment: 'Autonomy reduced to Level 1, all decisions require human approval',
    eta: '48 hours',
    timeline: [
      { time: '14:23', action: 'Drift detector alert triggered — KL divergence > 0.15 threshold' },
      { time: '14:25', action: 'Automated: Autonomy gate reduced Mortgage from Level 2 → Level 1' },
      { time: '14:28', action: 'Alert routed to Head of AI (James Chen)' },
      { time: '14:35', action: 'Manual review: 23 decisions in last 2 hours flagged for human re-review' },
      { time: '14:45', action: 'CRO notified — incident logged as HIGH severity' },
      { time: '15:10', action: 'Root cause hypothesis: Q2 housing market data shift. Investigation ongoing.' },
    ],
  },
  {
    id: 'INC-2026-009',
    date: '2026-06-08',
    title: 'KYC latency spike (p99 > 3s for 4 minutes)',
    severity: 'MEDIUM',
    status: 'contained',
    useCase: 'KYC',
    impact: '12 decisions queued, no incorrect decisions issued',
    rootCause: 'Upstream sanctions API throttling (rate limit hit during batch run)',
    containment: 'Cedar kill switch activated in 4 minutes. Queue drained in 8 minutes after API recovery.',
    timeline: [
      { time: '10:14', action: 'Latency monitor: p99 exceeded 3000ms threshold' },
      { time: '10:15', action: 'Automated: Cedar policy triggered queuing mode (no auto-approvals during elevated latency)' },
      { time: '10:16', action: 'Root cause identified: sanctions API returning 429 status' },
      { time: '10:18', action: 'Cedar kill switch activated — all new decisions held pending resolution' },
      { time: '10:22', action: 'Upstream API recovered. Queue processing resumed.' },
      { time: '10:30', action: 'All 12 queued decisions processed. No errors. Incident contained.' },
    ],
  },
];

// --- Near-Misses (governance controls prevented incident) ---

export const nearMisses: NearMiss[] = [
  { id: 'NM-2026-022', date: '2026-06-22', title: 'Cedar blocked override attempt on sanctioned entity', controlType: 'Cedar', useCase: 'KYC' },
  { id: 'NM-2026-019', date: '2026-06-19', title: 'Guardrail caught PII leakage in Claims prompt', controlType: 'Guardrail', useCase: 'Claims' },
  { id: 'NM-2026-014', date: '2026-06-14', title: 'Autonomy gate prevented auto-approve on high-risk case', controlType: 'Autonomy gate', useCase: 'KYC' },
  { id: 'NM-2026-011', date: '2026-06-11', title: 'Cedar denied escalation bypass (policy: min-2-eyes)', controlType: 'Cedar', useCase: 'Trade' },
  { id: 'NM-2026-003', date: '2026-06-03', title: 'Drift detector triggered revalidation before impact', controlType: 'Drift detector', useCase: 'Claims' },
];

// --- Summary ---

export function getIncidentSummary() {
  const underInvestigation = incidents.filter(i => i.status === 'under_investigation');
  const contained = incidents.filter(i => i.status === 'contained');
  return {
    totalIncidents: incidents.length,
    underInvestigation: underInvestigation.length,
    contained: contained.length,
    resolved: incidents.filter(i => i.status === 'resolved').length,
    nearMissCount: nearMisses.length,
  };
}
