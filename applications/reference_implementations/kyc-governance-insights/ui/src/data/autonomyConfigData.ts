import { autoTightenEvents as baseAutoTightenEvents } from './evaluationsData';
import type { AutoTightenEvent } from './evaluationsData';

export interface AutonomyLevel {
  level: number;
  name: string;
  description: string;
  color: string;
  humanRole: string;
}

export interface AutonomyParameter {
  id: string;
  label: string;
  value: number | string;
  unit: string;
  envelope: { min: number; max: number };
  owner: string;
  lastChanged: string;
  changedBy: string;
  requiresApproval: boolean;
}

export interface PromotionCriterion {
  metric: string;
  currentValue: number;
  requiredValue: number;
  met: boolean;
}

export interface Alarm {
  id: string;
  name: string;
  status: 'firing' | 'ok';
  metric: string;
  threshold: string;
  lastFired: string;
}

export interface ConfigAuditEntry {
  id: string;
  who: string;
  parameter: string;
  oldValue: string;
  newValue: string;
  timestamp: string;
  reason: string;
  approvedBy: string;
}

export const currentAutonomyLevel = 2;

export const autonomyLevels: AutonomyLevel[] = [
  { level: 0, name: 'Retrieval Only', description: 'Reads documents, extracts entities. Cannot make decisions.', color: '#64748b', humanRole: 'Operator' },
  { level: 1, name: 'Assisted Assessment', description: 'Produces draft assessments. All decisions require human approval.', color: '#3b82f6', humanRole: 'Collaborator' },
  { level: 2, name: 'Supervised Autonomy', description: 'Auto-approves low-risk cases. Escalates medium/high risk.', color: '#10b981', humanRole: 'Approver' },
  { level: 3, name: 'Delegated Autonomy', description: 'Handles full lifecycle including medium-risk. Escalates high-risk only.', color: '#f59e0b', humanRole: 'Consultant' },
  { level: 4, name: 'Earned Full Autonomy', description: 'Self-directs within mission charter. Exception-triggered review only.', color: '#a855f7', humanRole: 'Observer' },
];

export const autonomyConfig: AutonomyParameter[] = [
  { id: 'tier1_amount_limit', label: 'Auto-approve limit (Tier 1)', value: 25000, unit: '£', envelope: { min: 0, max: 50000 }, owner: 'KYC Team Lead', lastChanged: '2026-06-20T10:30:00Z', changedBy: 'j.smith@bank.com', requiresApproval: false },
  { id: 'tier2_amount_limit', label: 'Auto-approve limit (Tier 2)', value: 100000, unit: '£', envelope: { min: 25001, max: 500000 }, owner: 'Head of Financial Crime', lastChanged: '2026-06-15T14:00:00Z', changedBy: 'm.jones@bank.com', requiresApproval: true },
  { id: 'risk_escalation_threshold', label: 'Risk score escalation threshold', value: 0.70, unit: 'score', envelope: { min: 0.50, max: 0.90 }, owner: 'MLRO', lastChanged: '2026-06-18T09:15:00Z', changedBy: 'r.patel@bank.com', requiresApproval: true },
  { id: 'sanctions_block_threshold', label: 'Sanctions hard-block threshold', value: 0.85, unit: 'score', envelope: { min: 0.75, max: 0.95 }, owner: 'MLRO', lastChanged: '2026-06-10T11:00:00Z', changedBy: 'r.patel@bank.com', requiresApproval: true },
  { id: 'jurisdiction_allowlist', label: 'Jurisdiction allowlist', value: 3, unit: 'regions', envelope: { min: 1, max: 12 }, owner: 'Compliance Manager', lastChanged: '2026-06-05T16:30:00Z', changedBy: 'a.wong@bank.com', requiresApproval: false },
  { id: 'business_hours_start', label: 'Business hours (start)', value: 8, unit: 'hour', envelope: { min: 6, max: 22 }, owner: 'Ops Manager', lastChanged: '2026-05-01T08:00:00Z', changedBy: 'k.brown@bank.com', requiresApproval: false },
  { id: 'max_concurrent_assessments', label: 'Max concurrent assessments', value: 10, unit: 'cases', envelope: { min: 1, max: 50 }, owner: 'Ops Manager', lastChanged: '2026-06-22T13:45:00Z', changedBy: 'k.brown@bank.com', requiresApproval: false },
  { id: 'hitl_routing', label: 'HITL escalation routing', value: 500000, unit: '£ threshold', envelope: { min: 100000, max: 2000000 }, owner: 'KYC Team Lead', lastChanged: '2026-06-12T10:00:00Z', changedBy: 'j.smith@bank.com', requiresApproval: false },
  { id: 'rate_throttle', label: 'Rate throttle (decisions/hour)', value: 100, unit: '/hr', envelope: { min: 10, max: 500 }, owner: 'Ops Manager', lastChanged: '2026-06-24T09:00:00Z', changedBy: 'k.brown@bank.com', requiresApproval: false },
  { id: 'queue_depth_alarm', label: 'Queue depth threshold', value: 25, unit: 'pending', envelope: { min: 5, max: 100 }, owner: 'Ops Manager', lastChanged: '2026-06-21T15:30:00Z', changedBy: 'k.brown@bank.com', requiresApproval: false },
  { id: 'response_sla', label: 'Response time SLA', value: 40, unit: 'seconds', envelope: { min: 10, max: 120 }, owner: 'KYC Team Lead', lastChanged: '2026-06-19T11:00:00Z', changedBy: 'j.smith@bank.com', requiresApproval: false },
  { id: 'pep_escalation_level', label: 'PEP escalation level', value: 2, unit: 'level', envelope: { min: 1, max: 4 }, owner: 'MLRO', lastChanged: '2026-06-08T14:15:00Z', changedBy: 'r.patel@bank.com', requiresApproval: true },
  { id: 'ubo_depth', label: 'UBO depth before escalation', value: 4, unit: 'layers', envelope: { min: 2, max: 6 }, owner: 'Head of Financial Crime', lastChanged: '2026-06-14T16:00:00Z', changedBy: 'm.jones@bank.com', requiresApproval: true },
];

export const promotionCriteria: PromotionCriterion[] = [
  { metric: 'Sanctions screening precision', currentValue: 97.2, requiredValue: 97, met: true },
  { metric: 'Override rate (30-day)', currentValue: 8.4, requiredValue: 10, met: true },
  { metric: 'Decision consistency (variance)', currentValue: 6.1, requiredValue: 7, met: true },
  { metric: 'Cumulative cases without critical failure', currentValue: 1847, requiredValue: 2000, met: false },
  { metric: 'Model risk validation sign-off', currentValue: 0, requiredValue: 1, met: false },
];

export const alarms: Alarm[] = [
  { id: 'alm-001', name: 'Sanctions Precision', status: 'ok', metric: 'sanctions_precision', threshold: '< 95%', lastFired: '2026-06-16T14:32:00Z' },
  { id: 'alm-002', name: 'Override Rate', status: 'firing', metric: 'override_rate_7d', threshold: '> 30%', lastFired: '2026-06-26T08:15:00Z' },
  { id: 'alm-003', name: 'Decision Variance', status: 'ok', metric: 'decision_variance', threshold: '> 10%', lastFired: '2026-06-19T11:15:00Z' },
  { id: 'alm-004', name: 'Queue Depth', status: 'ok', metric: 'queue_depth', threshold: '> 25 pending', lastFired: '2026-06-10T09:00:00Z' },
  { id: 'alm-005', name: 'Response SLA', status: 'ok', metric: 'response_time_p95', threshold: '> 40s', lastFired: '2026-06-03T17:22:00Z' },
  { id: 'alm-006', name: 'Cost per Decision', status: 'ok', metric: 'cost_per_decision', threshold: '> £2.50', lastFired: '2026-05-28T10:45:00Z' },
];

export const configAuditLog: ConfigAuditEntry[] = [
  { id: 'aud-001', who: 'r.patel@bank.com', parameter: 'Risk score escalation threshold', oldValue: '0.65', newValue: '0.70', timestamp: '2026-06-18T09:15:00Z', reason: 'Reduced false escalations after 30-day review', approvedBy: 'MLRO (self)' },
  { id: 'aud-002', who: 'j.smith@bank.com', parameter: 'Auto-approve limit (Tier 1)', oldValue: '£20,000', newValue: '£25,000', timestamp: '2026-06-20T10:30:00Z', reason: 'Q2 risk appetite review — low-risk volume increase', approvedBy: 'r.patel@bank.com' },
  { id: 'aud-003', who: 'k.brown@bank.com', parameter: 'Max concurrent assessments', oldValue: '8', newValue: '10', timestamp: '2026-06-22T13:45:00Z', reason: 'Queue depth alert — capacity adjustment', approvedBy: 'k.brown@bank.com' },
  { id: 'aud-004', who: 'k.brown@bank.com', parameter: 'Rate throttle', oldValue: '80/hr', newValue: '100/hr', timestamp: '2026-06-24T09:00:00Z', reason: 'Aligned with new concurrent assessment limit', approvedBy: 'k.brown@bank.com' },
  { id: 'aud-005', who: 'SYSTEM', parameter: 'Sanctions hard-block threshold', oldValue: '0.82', newValue: '0.85', timestamp: '2026-06-16T14:32:00Z', reason: 'AUTO-TIGHTEN: precision below 95%', approvedBy: 'AUTO' },
  { id: 'aud-006', who: 'm.jones@bank.com', parameter: 'Auto-approve limit (Tier 2)', oldValue: '£75,000', newValue: '£100,000', timestamp: '2026-06-15T14:00:00Z', reason: 'Post-review increase — 30 days zero incidents', approvedBy: 'r.patel@bank.com' },
  { id: 'aud-007', who: 'r.patel@bank.com', parameter: 'PEP escalation level', oldValue: 'Level 3+', newValue: 'Level 2+', timestamp: '2026-06-08T14:15:00Z', reason: 'Regulatory guidance update — increased PEP scrutiny', approvedBy: 'MLRO (self)' },
  { id: 'aud-008', who: 'a.wong@bank.com', parameter: 'Jurisdiction allowlist', oldValue: 'UK, EU', newValue: 'UK, EU, US', timestamp: '2026-06-05T16:30:00Z', reason: 'US correspondent banking onboarding', approvedBy: 'a.wong@bank.com' },
  { id: 'aud-009', who: 'SYSTEM', parameter: 'UBO depth before escalation', oldValue: '4 layers', newValue: '3 layers', timestamp: '2026-06-18T09:47:00Z', reason: 'AUTO-TIGHTEN: UBO completeness below 90%', approvedBy: 'AUTO' },
  { id: 'aud-010', who: 'j.smith@bank.com', parameter: 'Response time SLA', oldValue: '30s', newValue: '40s', timestamp: '2026-06-19T11:00:00Z', reason: 'Aligned with increased assessment complexity', approvedBy: 'j.smith@bank.com' },
];

export const autoTightenEvents: AutoTightenEvent[] = baseAutoTightenEvents;
