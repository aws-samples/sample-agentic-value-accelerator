/**
 * agentSafetyControls — Runtime safety controls for agentic AI.
 *
 * Based on findings from "On the Surprising Efficacy of LLMs for Penetration-Testing"
 * (Happe & Cito, 2025) which identified key safety gaps:
 * - LLMs ignoring safety instructions and attacking forbidden systems
 * - Alignment drift where agents discard assigned tasks
 * - Capability vs reliability gap (can do it, but not consistently)
 *
 * This module provides:
 * 1. Forbidden Targets — explicit blocklist of systems agents must not access
 * 2. Alignment Drift Detection — runtime monitoring for goal deviation
 * 3. Reliability Metrics — multi-run consistency tracking
 */

import type { AgentRegistryEntry } from '../mockData';

// ─────────────────────────── Forbidden Targets ───────────────────────────

export type ForbiddenTargetType = 'system' | 'api' | 'data' | 'network' | 'action';

export interface ForbiddenTarget {
  id: string;
  name: string;
  type: ForbiddenTargetType;
  pattern: string;
  description: string;
  severity: 'critical' | 'high' | 'medium';
  enforced: boolean;
  createdAt: string;
  lastTriggered?: string;
  triggerCount: number;
}

export const FORBIDDEN_TARGETS: ForbiddenTarget[] = [
  {
    id: 'ft-prod-db',
    name: 'Production Databases',
    type: 'system',
    pattern: 'prod-*.db.internal, rds-prod-*',
    description: 'Direct access to production databases is forbidden. Use approved read-only replicas.',
    severity: 'critical',
    enforced: true,
    createdAt: '2026-01-15',
    lastTriggered: '2026-07-12',
    triggerCount: 3,
  },
  {
    id: 'ft-pii-export',
    name: 'PII Bulk Export',
    type: 'action',
    pattern: 'export_*, bulk_download, data_dump',
    description: 'Bulk export of PII data is forbidden. Individual record access only.',
    severity: 'critical',
    enforced: true,
    createdAt: '2026-01-15',
    lastTriggered: '2026-06-28',
    triggerCount: 7,
  },
  {
    id: 'ft-admin-api',
    name: 'Admin APIs',
    type: 'api',
    pattern: '/admin/*, /internal/*, /_system/*',
    description: 'Administrative and internal APIs are off-limits to agents.',
    severity: 'high',
    enforced: true,
    createdAt: '2026-02-01',
    triggerCount: 0,
  },
  {
    id: 'ft-secrets',
    name: 'Secrets Manager Direct Access',
    type: 'system',
    pattern: 'secretsmanager:GetSecretValue, ssm:GetParameter*Secure*',
    description: 'Agents must not directly retrieve secrets. Use delegated credential injection.',
    severity: 'critical',
    enforced: true,
    createdAt: '2026-02-01',
    lastTriggered: '2026-05-14',
    triggerCount: 2,
  },
  {
    id: 'ft-iam-modify',
    name: 'IAM Modification',
    type: 'action',
    pattern: 'iam:Create*, iam:Delete*, iam:Update*, iam:Attach*, iam:Detach*',
    description: 'Agents cannot modify IAM policies, roles, or permissions.',
    severity: 'critical',
    enforced: true,
    createdAt: '2026-01-15',
    triggerCount: 0,
  },
  {
    id: 'ft-external-net',
    name: 'External Network Egress',
    type: 'network',
    pattern: '0.0.0.0/0, !10.0.0.0/8, !172.16.0.0/12, !192.168.0.0/16',
    description: 'Agents cannot initiate connections to external networks without explicit approval.',
    severity: 'high',
    enforced: false,
    createdAt: '2026-03-10',
    triggerCount: 0,
  },
  {
    id: 'ft-other-agents',
    name: 'Unauthorized Agent Invocation',
    type: 'action',
    pattern: 'invoke_agent:* (not in A2A allowlist)',
    description: 'Agents can only invoke other agents explicitly listed in A2A trust registry.',
    severity: 'high',
    enforced: true,
    createdAt: '2026-02-15',
    lastTriggered: '2026-07-01',
    triggerCount: 4,
  },
  {
    id: 'ft-compliance-data',
    name: 'Compliance-Restricted Data',
    type: 'data',
    pattern: 'sox_*, hipaa_*, pci_zone_*',
    description: 'Data in compliance-restricted zones requires explicit human approval per access.',
    severity: 'critical',
    enforced: true,
    createdAt: '2026-01-20',
    triggerCount: 0,
  },
];

export const TARGET_TYPE_META: Record<ForbiddenTargetType, { label: string; icon: string; color: string }> = {
  system: { label: 'System', icon: 'server', color: '#6366f1' },
  api: { label: 'API', icon: 'code-bracket', color: '#8b5cf6' },
  data: { label: 'Data', icon: 'circle-stack', color: '#0ea5e9' },
  network: { label: 'Network', icon: 'globe-alt', color: '#14b8a6' },
  action: { label: 'Action', icon: 'bolt', color: '#f59e0b' },
};

// ─────────────────────────── Alignment Drift ───────────────────────────

export type DriftSeverity = 'critical' | 'warning' | 'info';
export type DriftType = 'goal' | 'scope' | 'tool' | 'data' | 'behavior';

export interface AlignmentDriftEvent {
  id: string;
  agentId: string;
  agentName: string;
  timestamp: string;
  driftType: DriftType;
  severity: DriftSeverity;
  expectedBehavior: string;
  actualBehavior: string;
  goalDeviation: number;
  resolved: boolean;
  resolution?: string;
}

export const DRIFT_TYPE_META: Record<DriftType, { label: string; description: string; color: string }> = {
  goal: { label: 'Goal Drift', description: 'Agent pursuing different objective than assigned', color: '#ef4444' },
  scope: { label: 'Scope Creep', description: 'Agent operating outside authorized boundaries', color: '#f97316' },
  tool: { label: 'Tool Misuse', description: 'Using tools for unintended purposes', color: '#eab308' },
  data: { label: 'Data Access', description: 'Accessing data beyond task requirements', color: '#8b5cf6' },
  behavior: { label: 'Behavior Change', description: 'Significant change in response patterns', color: '#6366f1' },
};

export const ALIGNMENT_DRIFT_EVENTS: AlignmentDriftEvent[] = [
  {
    id: 'drift-001',
    agentId: 'agt-cust-svc',
    agentName: 'Customer Service Agent',
    timestamp: '2026-07-18T14:32:00Z',
    driftType: 'scope',
    severity: 'warning',
    expectedBehavior: 'Answer customer FAQ and create support tickets',
    actualBehavior: 'Attempted to access customer transaction history without ticket context',
    goalDeviation: 0.35,
    resolved: true,
    resolution: 'Guardrail blocked access; agent returned to FAQ flow',
  },
  {
    id: 'drift-002',
    agentId: 'agt-fraud',
    agentName: 'Fraud Detection Agent',
    timestamp: '2026-07-17T09:15:00Z',
    driftType: 'tool',
    severity: 'critical',
    expectedBehavior: 'Use case-enrichment tool for flagged transactions only',
    actualBehavior: 'Invoked case-enrichment on non-flagged accounts (scanning behavior)',
    goalDeviation: 0.72,
    resolved: true,
    resolution: 'Session terminated; tool access revoked pending review',
  },
  {
    id: 'drift-003',
    agentId: 'agt-mktsurv',
    agentName: 'Market Surveillance Agent',
    timestamp: '2026-07-19T11:45:00Z',
    driftType: 'goal',
    severity: 'critical',
    expectedBehavior: 'Monitor for insider trading patterns',
    actualBehavior: 'Began generating trading recommendations instead of surveillance',
    goalDeviation: 0.89,
    resolved: false,
  },
  {
    id: 'drift-004',
    agentId: 'agt-kyc',
    agentName: 'KYC Banking Agent',
    timestamp: '2026-07-16T16:20:00Z',
    driftType: 'data',
    severity: 'warning',
    expectedBehavior: 'Access only current customer record for verification',
    actualBehavior: 'Queried historical records and related accounts',
    goalDeviation: 0.28,
    resolved: true,
    resolution: 'Query scope restricted; additional logging enabled',
  },
  {
    id: 'drift-005',
    agentId: 'agt-cust-svc',
    agentName: 'Customer Service Agent',
    timestamp: '2026-07-15T10:05:00Z',
    driftType: 'behavior',
    severity: 'info',
    expectedBehavior: 'Consistent response length and tone',
    actualBehavior: 'Response verbosity increased 40% over baseline',
    goalDeviation: 0.15,
    resolved: true,
    resolution: 'Model temperature adjusted; baseline updated',
  },
];

// ─────────────────────────── Reliability Metrics ───────────────────────────

export interface ReliabilityMetrics {
  agentId: string;
  agentName: string;
  period: '7d' | '30d' | '90d';
  totalRuns: number;
  successfulRuns: number;
  successRate: number;
  consistencyScore: number;
  avgResponseVariance: number;
  taskCompletionRate: number;
  goalAdherenceRate: number;
  errorCategories: { category: string; count: number; pct: number }[];
  reliabilityTrend: { date: string; rate: number }[];
}

export const AGENT_RELIABILITY: ReliabilityMetrics[] = [
  {
    agentId: 'agt-cust-svc',
    agentName: 'Customer Service Agent',
    period: '30d',
    totalRuns: 45200,
    successfulRuns: 44296,
    successRate: 98.0,
    consistencyScore: 94.2,
    avgResponseVariance: 0.12,
    taskCompletionRate: 97.5,
    goalAdherenceRate: 99.1,
    errorCategories: [
      { category: 'Hallucination', count: 362, pct: 40 },
      { category: 'Tool failure', count: 271, pct: 30 },
      { category: 'Timeout', count: 181, pct: 20 },
      { category: 'Guardrail block', count: 90, pct: 10 },
    ],
    reliabilityTrend: [
      { date: '2026-06-20', rate: 97.2 },
      { date: '2026-06-27', rate: 97.8 },
      { date: '2026-07-04', rate: 98.1 },
      { date: '2026-07-11', rate: 97.9 },
      { date: '2026-07-18', rate: 98.0 },
    ],
  },
  {
    agentId: 'agt-fraud',
    agentName: 'Fraud Detection Agent',
    period: '30d',
    totalRuns: 38900,
    successfulRuns: 38511,
    successRate: 99.0,
    consistencyScore: 97.8,
    avgResponseVariance: 0.05,
    taskCompletionRate: 99.2,
    goalAdherenceRate: 99.7,
    errorCategories: [
      { category: 'Data unavailable', count: 195, pct: 50 },
      { category: 'Timeout', count: 117, pct: 30 },
      { category: 'Tool failure', count: 78, pct: 20 },
    ],
    reliabilityTrend: [
      { date: '2026-06-20', rate: 98.8 },
      { date: '2026-06-27', rate: 99.1 },
      { date: '2026-07-04', rate: 99.0 },
      { date: '2026-07-11', rate: 99.2 },
      { date: '2026-07-18', rate: 99.0 },
    ],
  },
  {
    agentId: 'agt-mktsurv',
    agentName: 'Market Surveillance Agent',
    period: '30d',
    totalRuns: 12800,
    successfulRuns: 11648,
    successRate: 91.0,
    consistencyScore: 78.5,
    avgResponseVariance: 0.34,
    taskCompletionRate: 89.2,
    goalAdherenceRate: 85.3,
    errorCategories: [
      { category: 'Goal drift', count: 512, pct: 44 },
      { category: 'Hallucination', count: 384, pct: 33 },
      { category: 'Data quality', count: 192, pct: 17 },
      { category: 'Other', count: 64, pct: 6 },
    ],
    reliabilityTrend: [
      { date: '2026-06-20', rate: 94.2 },
      { date: '2026-06-27', rate: 92.1 },
      { date: '2026-07-04', rate: 90.5 },
      { date: '2026-07-11', rate: 89.8 },
      { date: '2026-07-18', rate: 91.0 },
    ],
  },
  {
    agentId: 'agt-kyc',
    agentName: 'KYC Banking Agent',
    period: '30d',
    totalRuns: 21400,
    successfulRuns: 21079,
    successRate: 98.5,
    consistencyScore: 96.1,
    avgResponseVariance: 0.08,
    taskCompletionRate: 98.8,
    goalAdherenceRate: 99.4,
    errorCategories: [
      { category: 'External API', count: 171, pct: 53 },
      { category: 'Data mismatch', count: 107, pct: 33 },
      { category: 'Timeout', count: 43, pct: 13 },
    ],
    reliabilityTrend: [
      { date: '2026-06-20', rate: 98.2 },
      { date: '2026-06-27', rate: 98.4 },
      { date: '2026-07-04', rate: 98.6 },
      { date: '2026-07-11', rate: 98.3 },
      { date: '2026-07-18', rate: 98.5 },
    ],
  },
  {
    agentId: 'agt-claims',
    agentName: 'Claims Processing Agent',
    period: '30d',
    totalRuns: 6200,
    successfulRuns: 6014,
    successRate: 97.0,
    consistencyScore: 91.3,
    avgResponseVariance: 0.18,
    taskCompletionRate: 96.2,
    goalAdherenceRate: 97.8,
    errorCategories: [
      { category: 'Document parsing', count: 93, pct: 50 },
      { category: 'Classification error', count: 56, pct: 30 },
      { category: 'Tool failure', count: 37, pct: 20 },
    ],
    reliabilityTrend: [
      { date: '2026-06-20', rate: 96.5 },
      { date: '2026-06-27', rate: 96.8 },
      { date: '2026-07-04', rate: 97.2 },
      { date: '2026-07-11', rate: 96.9 },
      { date: '2026-07-18', rate: 97.0 },
    ],
  },
];

// ─────────────────────────── Helper Functions ───────────────────────────

export function getAgentReliability(agentId: string): ReliabilityMetrics | undefined {
  return AGENT_RELIABILITY.find(r => r.agentId === agentId);
}

export function getAgentDriftEvents(agentId: string): AlignmentDriftEvent[] {
  return ALIGNMENT_DRIFT_EVENTS.filter(e => e.agentId === agentId);
}

export function getUnresolvedDriftEvents(): AlignmentDriftEvent[] {
  return ALIGNMENT_DRIFT_EVENTS.filter(e => !e.resolved);
}

export function getRecentDriftEvents(hours: number = 24): AlignmentDriftEvent[] {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  return ALIGNMENT_DRIFT_EVENTS.filter(e => e.timestamp >= cutoff);
}

export function getEnforcedForbiddenTargets(): ForbiddenTarget[] {
  return FORBIDDEN_TARGETS.filter(t => t.enforced);
}

export function getRecentlyTriggeredTargets(): ForbiddenTarget[] {
  return FORBIDDEN_TARGETS.filter(t => t.lastTriggered).sort(
    (a, b) => (b.lastTriggered ?? '').localeCompare(a.lastTriggered ?? '')
  );
}

export function computeFleetReliability(): {
  avgSuccessRate: number;
  avgConsistency: number;
  avgGoalAdherence: number;
  agentsBelowThreshold: number;
} {
  const n = AGENT_RELIABILITY.length || 1;
  const avgSuccessRate = AGENT_RELIABILITY.reduce((s, r) => s + r.successRate, 0) / n;
  const avgConsistency = AGENT_RELIABILITY.reduce((s, r) => s + r.consistencyScore, 0) / n;
  const avgGoalAdherence = AGENT_RELIABILITY.reduce((s, r) => s + r.goalAdherenceRate, 0) / n;
  const agentsBelowThreshold = AGENT_RELIABILITY.filter(r => r.successRate < 95 || r.goalAdherenceRate < 95).length;
  return { avgSuccessRate, avgConsistency, avgGoalAdherence, agentsBelowThreshold };
}
