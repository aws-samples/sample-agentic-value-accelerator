/**
 * useSLAData - Hooks for SLA management backed by the operations API.
 *
 * Provides:
 *   - useSLAs() - SLA list + error budgets
 *   - useSLABreaches() - Breach management with acknowledge/resolve actions
 *   - useSLACompliance(period) - Compliance report for a given period
 *
 * Backend routes (all under /api/v1/govern/operations):
 *   GET   /sla                                 SLA list with compliance status
 *   GET   /sla/breaches?days=N                 Breach records
 *   GET   /sla/compliance?days=N               Compliance report for the window
 *   GET   /sla/error-budgets                   Error-budget position per SLA
 *   POST  /sla                                 Create an SLA target
 *   PATCH /sla/breaches/{id}/acknowledge       Acknowledge a breach
 *   PATCH /sla/breaches/{id}/resolve           Resolve a breach
 *
 * Provenance / honest degrade:
 *   - SLA *targets* and *breach records* are real (DynamoDB).
 *   - SLA *measured values* (current_value, and anything derived from it such as
 *     overall compliance %) are still simulated in the backend compliance
 *     calculation; wiring them to CloudWatch/Synthetics is a separate change.
 *     Those fields are therefore mapped to `null` and rendered as "—" instead of
 *     putting a fabricated number under a Live badge.
 *   - Falls back to mock data when the API reports live === false (no stored
 *     definitions/records) or the request fails.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useDataSources } from '../DataSourceContext';
import { usePollingKey } from '../usePollingKey';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 'unknown' covers SLAs that exist but have not been measured yet (e.g. one that
 * was just created), so the UI never has to guess "meeting".
 */
export type SLAStatus = 'meeting' | 'at-risk' | 'breached' | 'unknown';
export type MeasurementWindow = 'hourly' | 'daily' | 'weekly' | 'monthly';
export type BreachSeverity = 'critical' | 'high' | 'medium' | 'low';
export type BreachStatus = 'active' | 'resolved' | 'acknowledged';

export interface SLAMetric {
  name: string;
  target: number;
  current: number;
  unit: string;
  trend: number[];
  /**
   * Whether a lower value is better for this metric (e.g. latency, error rate).
   * When omitted, callers fall back to a unit/name heuristic. Set explicitly
   * on seeded data so "Met/Miss" never has to guess for rate-style metrics
   * whose target is >= 1 (e.g. Error Rate 5.0%, False Positive Rate 2.0%).
   */
  lowerIsBetter?: boolean;
}

export interface SLADefinition {
  id: string;
  name: string;
  description: string;
  status: SLAStatus;
  /**
   * Overall compliance %. `null` when no measured value is available - the
   * backend compliance calculation still simulates current values, so live SLAs
   * report null until CloudWatch/Synthetics is wired in.
   */
  overallCompliance: number | null;
  agents: string[];
  metrics: SLAMetric[];
  measurementWindow: MeasurementWindow;
  /** Not modelled by the backend SLA target; `null` for API-sourced SLAs. */
  breachThreshold: number | null;
  notificationChannels: string[];
  template?: string;
  createdDate: string;
  lastUpdated: string;
  windowRemaining: string;
}

export interface Breach {
  id: string;
  slaId: string;
  slaName: string;
  /** Optional: no backend writer populates the breached metric name yet. */
  metricName?: string;
  /** Optional: no backend writer populates severity yet. */
  severity?: BreachSeverity;
  startTime: string;
  endTime?: string;
  duration: string;
  status: BreachStatus;
  rootCause?: string;
  incidentId?: string;
  resolutionNotes?: string;
  impactedAgents: string[];
}

export interface ErrorBudget {
  slaId: string;
  slaName: string;
  /** Only derivable for availability SLAs; undefined otherwise. */
  totalBudgetMinutes?: number;
  usedBudgetMinutes?: number;
  remainingPercent: number;
  /** Burn rate/trend/history need a historical store that does not exist yet. */
  burnRate?: number;
  burnRateTrend?: 'increasing' | 'stable' | 'decreasing';
  projectedExhaustion?: string;
  history: { date: string; remaining: number }[];
}

export interface ComplianceReport {
  id: string;
  period: string;
  /** `null` when compliance is not measured (see SLADefinition.overallCompliance). */
  overallCompliance: number | null;
  /** `null` when the met/missed split is not measured. */
  slasMet: number | null;
  slasTotal: number;
  breachCount: number;
  avgResolutionTime: string;
  generatedDate: string;
}

export interface SLACreateRequest {
  name: string;
  description: string;
  templateId?: string;
  measurementWindow: MeasurementWindow;
  agents: string[];
  metrics: Omit<SLAMetric, 'current' | 'trend'>[];
  notificationChannels: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Mock Data (Fallback)
// ═══════════════════════════════════════════════════════════════════════════════

const MOCK_SLAS: SLADefinition[] = [
  {
    id: 'sla-1',
    name: 'Trading Platform Core',
    description: 'Critical SLA for algorithmic trading and market data agents',
    status: 'meeting',
    overallCompliance: 99.97,
    agents: ['trade-executor-1', 'market-data-agent', 'risk-calc-agent'],
    metrics: [
      { name: 'Availability', target: 99.99, current: 99.97, unit: '%', trend: [99.98, 99.99, 99.97, 99.98, 99.97, 99.96, 99.97], lowerIsBetter: false },
      { name: 'Latency P99', target: 50, current: 42, unit: 'ms', trend: [45, 43, 44, 42, 41, 43, 42], lowerIsBetter: true },
      { name: 'Error Rate', target: 0.01, current: 0.008, unit: '%', trend: [0.009, 0.01, 0.008, 0.007, 0.009, 0.008, 0.008], lowerIsBetter: true },
      { name: 'Throughput', target: 10000, current: 12500, unit: 'req/s', trend: [11000, 11500, 12000, 12200, 12400, 12300, 12500], lowerIsBetter: false },
    ],
    measurementWindow: 'monthly',
    breachThreshold: 99.9,
    notificationChannels: ['slack-trading-alerts', 'pagerduty-critical', 'email-trading-ops'],
    template: 'Production Critical',
    createdDate: '2026-01-15',
    lastUpdated: '2026-08-01',
    windowRemaining: '19 days',
  },
  {
    id: 'sla-2',
    name: 'Customer Service Agents',
    description: 'SLA for customer-facing support and inquiry agents',
    status: 'meeting',
    overallCompliance: 99.82,
    agents: ['cs-inquiry-agent', 'cs-routing-agent', 'sentiment-analyzer'],
    metrics: [
      { name: 'Availability', target: 99.5, current: 99.82, unit: '%', trend: [99.7, 99.8, 99.85, 99.82, 99.79, 99.81, 99.82], lowerIsBetter: false },
      { name: 'Response Time', target: 500, current: 380, unit: 'ms', trend: [420, 400, 390, 385, 378, 382, 380], lowerIsBetter: true },
      { name: 'Error Rate', target: 0.5, current: 0.18, unit: '%', trend: [0.22, 0.2, 0.19, 0.18, 0.17, 0.19, 0.18], lowerIsBetter: true },
    ],
    measurementWindow: 'weekly',
    breachThreshold: 99.0,
    notificationChannels: ['slack-cs-ops', 'email-cs-leads'],
    template: 'Customer-Facing',
    createdDate: '2026-02-20',
    lastUpdated: '2026-08-05',
    windowRemaining: '3 days',
  },
  {
    id: 'sla-3',
    name: 'Fraud Detection Pipeline',
    description: 'Real-time fraud detection and prevention agents',
    status: 'at-risk',
    overallCompliance: 99.52,
    agents: ['fraud-detector-primary', 'fraud-detector-ml', 'alert-dispatcher'],
    metrics: [
      { name: 'Availability', target: 99.95, current: 99.52, unit: '%', trend: [99.9, 99.85, 99.7, 99.6, 99.55, 99.5, 99.52], lowerIsBetter: false },
      { name: 'Latency P99', target: 100, current: 95, unit: 'ms', trend: [85, 88, 90, 92, 94, 96, 95], lowerIsBetter: true },
      { name: 'Error Rate', target: 0.05, current: 0.048, unit: '%', trend: [0.03, 0.035, 0.04, 0.042, 0.045, 0.047, 0.048], lowerIsBetter: true },
      { name: 'False Positive Rate', target: 2.0, current: 1.8, unit: '%', trend: [1.5, 1.6, 1.65, 1.7, 1.75, 1.78, 1.8], lowerIsBetter: true },
    ],
    measurementWindow: 'daily',
    breachThreshold: 99.5,
    notificationChannels: ['pagerduty-fraud', 'slack-security-ops'],
    template: 'Production Critical',
    createdDate: '2026-01-10',
    lastUpdated: '2026-08-10',
    windowRemaining: '14 hours',
  },
  {
    id: 'sla-4',
    name: 'Risk Reporting Suite',
    description: 'Regulatory risk calculation and reporting agents',
    status: 'meeting',
    overallCompliance: 99.91,
    agents: ['risk-aggregator', 'var-calculator', 'report-generator'],
    metrics: [
      { name: 'Availability', target: 99.9, current: 99.91, unit: '%', trend: [99.92, 99.9, 99.89, 99.91, 99.92, 99.9, 99.91], lowerIsBetter: false },
      { name: 'Calculation Accuracy', target: 99.99, current: 99.995, unit: '%', trend: [99.99, 99.995, 99.99, 99.995, 99.995, 99.99, 99.995], lowerIsBetter: false },
      { name: 'Report Delivery', target: 100, current: 100, unit: '%', trend: [100, 100, 100, 100, 100, 100, 100], lowerIsBetter: false },
    ],
    measurementWindow: 'monthly',
    breachThreshold: 99.5,
    notificationChannels: ['email-risk-team', 'slack-risk-ops'],
    template: 'Production Standard',
    createdDate: '2026-03-01',
    lastUpdated: '2026-08-08',
    windowRemaining: '19 days',
  },
  {
    id: 'sla-5',
    name: 'Internal Analytics',
    description: 'Internal business intelligence and analytics agents',
    status: 'meeting',
    overallCompliance: 98.5,
    agents: ['bi-data-agent', 'dashboard-renderer', 'metric-aggregator'],
    metrics: [
      { name: 'Availability', target: 95.0, current: 98.5, unit: '%', trend: [97.5, 98.0, 98.2, 98.3, 98.4, 98.45, 98.5], lowerIsBetter: false },
      { name: 'Query Response', target: 2000, current: 1200, unit: 'ms', trend: [1500, 1400, 1350, 1300, 1250, 1220, 1200], lowerIsBetter: true },
    ],
    measurementWindow: 'weekly',
    breachThreshold: 90.0,
    notificationChannels: ['slack-analytics'],
    template: 'Dev/Test',
    createdDate: '2026-04-15',
    lastUpdated: '2026-08-06',
    windowRemaining: '3 days',
  },
  {
    id: 'sla-6',
    name: 'Compliance Monitoring',
    description: 'Regulatory compliance and audit trail agents',
    status: 'breached',
    overallCompliance: 98.2,
    agents: ['compliance-scanner', 'audit-logger', 'policy-enforcer'],
    metrics: [
      { name: 'Availability', target: 99.9, current: 98.2, unit: '%', trend: [99.8, 99.5, 99.2, 98.8, 98.5, 98.3, 98.2], lowerIsBetter: false },
      { name: 'Scan Coverage', target: 100, current: 99.8, unit: '%', trend: [100, 100, 99.9, 99.85, 99.8, 99.8, 99.8], lowerIsBetter: false },
      { name: 'Alert Latency', target: 60, current: 85, unit: 's', trend: [55, 60, 65, 70, 75, 80, 85], lowerIsBetter: true },
    ],
    measurementWindow: 'daily',
    breachThreshold: 99.5,
    notificationChannels: ['pagerduty-compliance', 'slack-compliance', 'email-compliance-leads'],
    template: 'Production Standard',
    createdDate: '2026-02-01',
    lastUpdated: '2026-08-11',
    windowRemaining: '13 hours',
  },
  {
    id: 'sla-7',
    name: 'Document Processing',
    description: 'Document intake, OCR, and classification agents',
    status: 'at-risk',
    overallCompliance: 99.1,
    agents: ['doc-intake-agent', 'ocr-processor', 'doc-classifier'],
    metrics: [
      { name: 'Availability', target: 99.5, current: 99.1, unit: '%', trend: [99.6, 99.5, 99.4, 99.3, 99.2, 99.15, 99.1], lowerIsBetter: false },
      { name: 'Processing Time', target: 5000, current: 4800, unit: 'ms', trend: [4200, 4400, 4500, 4600, 4700, 4750, 4800], lowerIsBetter: true },
      { name: 'Accuracy', target: 98.0, current: 98.2, unit: '%', trend: [98.5, 98.4, 98.35, 98.3, 98.25, 98.22, 98.2], lowerIsBetter: false },
    ],
    measurementWindow: 'weekly',
    breachThreshold: 98.5,
    notificationChannels: ['slack-doc-ops'],
    template: 'Production Standard',
    createdDate: '2026-05-01',
    lastUpdated: '2026-08-09',
    windowRemaining: '2 days',
  },
  {
    id: 'sla-8',
    name: 'Dev/Test Environment',
    description: 'Non-production agent testing and development',
    status: 'meeting',
    overallCompliance: 96.8,
    agents: ['test-agent-1', 'test-agent-2', 'dev-sandbox'],
    metrics: [
      { name: 'Availability', target: 90.0, current: 96.8, unit: '%', trend: [95.0, 95.5, 96.0, 96.2, 96.5, 96.7, 96.8], lowerIsBetter: false },
      { name: 'Error Rate', target: 5.0, current: 2.1, unit: '%', trend: [3.0, 2.8, 2.6, 2.4, 2.3, 2.2, 2.1], lowerIsBetter: true },
    ],
    measurementWindow: 'weekly',
    breachThreshold: 85.0,
    notificationChannels: ['slack-dev-team'],
    template: 'Dev/Test',
    createdDate: '2026-06-01',
    lastUpdated: '2026-08-07',
    windowRemaining: '3 days',
  },
];

const MOCK_BREACHES: Breach[] = [
  {
    id: 'br-1',
    slaId: 'sla-6',
    slaName: 'Compliance Monitoring',
    metricName: 'Availability',
    severity: 'high',
    startTime: '2026-08-11T02:15:00Z',
    duration: '9h 45m',
    status: 'active',
    impactedAgents: ['compliance-scanner', 'policy-enforcer'],
    incidentId: 'INC-2847',
  },
  {
    id: 'br-2',
    slaId: 'sla-6',
    slaName: 'Compliance Monitoring',
    metricName: 'Alert Latency',
    severity: 'medium',
    startTime: '2026-08-10T18:30:00Z',
    duration: '17h 30m',
    status: 'acknowledged',
    rootCause: 'Database connection pool exhaustion under high load',
    impactedAgents: ['audit-logger'],
    incidentId: 'INC-2846',
  },
  {
    id: 'br-3',
    slaId: 'sla-3',
    slaName: 'Fraud Detection Pipeline',
    metricName: 'Availability',
    severity: 'high',
    startTime: '2026-08-09T14:00:00Z',
    endTime: '2026-08-09T16:30:00Z',
    duration: '2h 30m',
    status: 'resolved',
    rootCause: 'Memory leak in fraud-detector-ml container',
    resolutionNotes: 'Deployed hotfix v2.4.1, increased memory limits, added automated restarts',
    impactedAgents: ['fraud-detector-ml'],
    incidentId: 'INC-2841',
  },
  {
    id: 'br-4',
    slaId: 'sla-1',
    slaName: 'Trading Platform Core',
    metricName: 'Latency P99',
    severity: 'critical',
    startTime: '2026-08-05T09:15:00Z',
    endTime: '2026-08-05T09:45:00Z',
    duration: '30m',
    status: 'resolved',
    rootCause: 'Network congestion during market open',
    resolutionNotes: 'Implemented traffic shaping, upgraded network capacity',
    impactedAgents: ['trade-executor-1'],
    incidentId: 'INC-2832',
  },
  {
    id: 'br-5',
    slaId: 'sla-7',
    slaName: 'Document Processing',
    metricName: 'Availability',
    severity: 'medium',
    startTime: '2026-08-08T22:00:00Z',
    endTime: '2026-08-09T01:00:00Z',
    duration: '3h',
    status: 'resolved',
    rootCause: 'Scheduled maintenance overran expected window',
    resolutionNotes: 'Updated maintenance procedures, improved rollback automation',
    impactedAgents: ['doc-intake-agent', 'ocr-processor'],
    incidentId: 'INC-2839',
  },
];

const MOCK_ERROR_BUDGETS: ErrorBudget[] = [
  {
    slaId: 'sla-1',
    slaName: 'Trading Platform Core',
    totalBudgetMinutes: 4.32,
    usedBudgetMinutes: 1.3,
    remainingPercent: 69.9,
    burnRate: 0.68,
    burnRateTrend: 'stable',
    history: [
      { date: '08-01', remaining: 100 },
      { date: '08-05', remaining: 92 },
      { date: '08-08', remaining: 85 },
      { date: '08-10', remaining: 75 },
      { date: '08-11', remaining: 69.9 },
    ],
  },
  {
    slaId: 'sla-3',
    slaName: 'Fraud Detection Pipeline',
    totalBudgetMinutes: 7.2,
    usedBudgetMinutes: 5.8,
    remainingPercent: 19.4,
    burnRate: 2.8,
    burnRateTrend: 'increasing',
    projectedExhaustion: '2026-08-13',
    history: [
      { date: '08-01', remaining: 100 },
      { date: '08-05', remaining: 65 },
      { date: '08-08', remaining: 42 },
      { date: '08-10', remaining: 28 },
      { date: '08-11', remaining: 19.4 },
    ],
  },
  {
    slaId: 'sla-6',
    slaName: 'Compliance Monitoring',
    totalBudgetMinutes: 14.4,
    usedBudgetMinutes: 18.2,
    remainingPercent: -26.4,
    burnRate: 4.2,
    burnRateTrend: 'increasing',
    history: [
      { date: '08-01', remaining: 100 },
      { date: '08-05', remaining: 55 },
      { date: '08-08', remaining: 22 },
      { date: '08-10', remaining: 5 },
      { date: '08-11', remaining: -26.4 },
    ],
  },
  {
    slaId: 'sla-2',
    slaName: 'Customer Service Agents',
    totalBudgetMinutes: 50.4,
    usedBudgetMinutes: 9.1,
    remainingPercent: 81.9,
    burnRate: 0.4,
    burnRateTrend: 'decreasing',
    history: [
      { date: '08-01', remaining: 100 },
      { date: '08-05', remaining: 95 },
      { date: '08-08', remaining: 88 },
      { date: '08-10', remaining: 84 },
      { date: '08-11', remaining: 81.9 },
    ],
  },
];

const MOCK_COMPLIANCE_REPORTS: ComplianceReport[] = [
  { id: 'rpt-aug', period: 'August 2026 (MTD)', overallCompliance: 99.12, slasMet: 6, slasTotal: 8, breachCount: 5, avgResolutionTime: '2h 15m', generatedDate: '2026-08-11' },
  { id: 'rpt-jul', period: 'July 2026', overallCompliance: 99.68, slasMet: 8, slasTotal: 8, breachCount: 2, avgResolutionTime: '1h 45m', generatedDate: '2026-08-01' },
  { id: 'rpt-jun', period: 'June 2026', overallCompliance: 99.54, slasMet: 7, slasTotal: 8, breachCount: 3, avgResolutionTime: '2h 30m', generatedDate: '2026-07-01' },
  { id: 'rpt-q2', period: 'Q2 2026', overallCompliance: 99.45, slasMet: 7, slasTotal: 8, breachCount: 8, avgResolutionTime: '2h 10m', generatedDate: '2026-07-01' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// API Base URL
// ═══════════════════════════════════════════════════════════════════════════════

const API_URL = import.meta.env.VITE_API_URL || '';

// ═══════════════════════════════════════════════════════════════════════════════
// API Functions
// ═══════════════════════════════════════════════════════════════════════════════

const OPS_BASE = `${API_URL}/api/v1/govern/operations`;

// ─── Wire shapes (snake_case, exactly as the operations API returns them) ───

interface WireSLACompliance {
  sla_id: string;
  sla_name: string;
  target_value: number;
  current_value: number;
  status: string; // compliant | at_risk | breached
  error_budget_remaining_pct: number;
  measurement_start: string;
  measurement_end: string;
  breaches_in_window: number;
}

interface WireSLAListResponse {
  slas: WireSLACompliance[];
  total: number;
  compliant_count: number;
  at_risk_count: number;
  breached_count: number;
  overall_compliance_pct: number;
  live: boolean;
  source: string;
  note?: string | null;
}

interface WireSLATarget {
  id: string;
  name: string;
  description: string;
  metric_type: string;
  target_value: number;
  target_unit: string;
  measurement_window: string;
  services: string[];
  agents: string[];
  created_at: string;
  updated_at: string;
}

interface WireSLABreach {
  id: string;
  sla_id: string;
  sla_name: string;
  breach_start: string;
  breach_end?: string | null;
  target_value: number;
  actual_value: number;
  impact_description: string;
  root_cause?: string | null;
  remediation?: string | null;
  metric_name?: string | null;
  severity?: string | null;
  acknowledged: boolean;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
}

interface WireSLABreachesResponse {
  breaches: WireSLABreach[];
  total: number;
  live: boolean;
  source: string;
  note?: string | null;
}

interface WireSLAErrorBudget {
  sla_id: string;
  sla_name: string;
  metric_type: string;
  measurement_window: string;
  target_value: number;
  current_value: number;
  remaining_pct: number;
  measurement_start: string;
  measurement_end: string;
  total_budget_minutes?: number | null;
  used_budget_minutes?: number | null;
  burn_rate?: number | null;
  burn_rate_trend?: string | null;
  projected_exhaustion?: string | null;
  history: { date?: string; remaining?: number }[];
}

interface WireSLAErrorBudgetsResponse {
  budgets: WireSLAErrorBudget[];
  total: number;
  avg_remaining_pct?: number | null;
  live: boolean;
  source: string;
  note?: string | null;
}

interface WireSLAComplianceReport {
  report_period_start: string;
  report_period_end: string;
  slas: WireSLACompliance[];
  overall_compliance_pct: number;
  total_breaches: number;
  // null when no SLA was evaluated - the backend no longer substitutes 100.0 there.
  avg_error_budget_remaining_pct: number | null;
  live: boolean;
  source: string;
  note?: string | null;
}

// ─── Mappers (wire -> UI shapes) ───

const SLA_STATUS_MAP: Record<string, SLAStatus> = {
  compliant: 'meeting',
  at_risk: 'at-risk',
  breached: 'breached',
};

const MEASUREMENT_WINDOWS: MeasurementWindow[] = ['hourly', 'daily', 'weekly', 'monthly'];
const BREACH_SEVERITIES: BreachSeverity[] = ['critical', 'high', 'medium', 'low'];
const BURN_TRENDS: NonNullable<ErrorBudget['burnRateTrend']>[] = ['increasing', 'stable', 'decreasing'];

function asMeasurementWindow(value: string | undefined | null): MeasurementWindow | null {
  return MEASUREMENT_WINDOWS.find(w => w === value) ?? null;
}

/** End of the measurement window that began at `start`. */
function windowEnd(window: MeasurementWindow, start: Date): Date {
  const end = new Date(start);
  if (window === 'hourly') end.setUTCHours(end.getUTCHours() + 1);
  else if (window === 'daily') end.setUTCDate(end.getUTCDate() + 1);
  else if (window === 'weekly') end.setUTCDate(end.getUTCDate() + 7);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}

function formatRemaining(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'window closed';
  const hours = ms / 3_600_000;
  return hours < 48 ? `${Math.round(hours)} hours` : `${Math.round(hours / 24)} days`;
}

function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h === 0 ? `${m}m` : `${h}h ${m}m`;
}

function isoDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? '' : new Date(parsed).toISOString().slice(0, 10);
}

/**
 * Map the API SLA list into the shape this UI renders.
 *
 * The error-budget response carries the per-SLA definition metadata (metric type
 * and measurement window) that the compliance list omits, so the two are joined
 * on sla_id. Measured values are deliberately dropped (see module docstring):
 * `overallCompliance` stays null and `metrics` stays empty rather than surfacing
 * the backend's simulated `current_value` as a real measurement.
 */
function mapSLAs(list: WireSLAListResponse, budgets: WireSLAErrorBudget[]): SLADefinition[] {
  const budgetById = new Map(budgets.map(b => [b.sla_id, b]));

  return list.slas.map(c => {
    const budget = budgetById.get(c.sla_id);
    const window = asMeasurementWindow(budget?.measurement_window) ?? 'monthly';
    const start = new Date(c.measurement_start);
    const remaining = Number.isNaN(start.getTime())
      ? '—'
      : formatRemaining(windowEnd(window, start).getTime() - Date.parse(c.measurement_end));

    return {
      id: c.sla_id,
      name: c.sla_name,
      description: '',
      status: SLA_STATUS_MAP[c.status] ?? 'unknown',
      overallCompliance: null,
      agents: [],
      metrics: [],
      measurementWindow: window,
      breachThreshold: null,
      notificationChannels: [],
      createdDate: '',
      lastUpdated: '',
      windowRemaining: remaining,
    };
  });
}

/** Map a created SLA target into the list shape. Status is 'unknown' - nothing measured yet. */
function mapCreatedSLA(target: WireSLATarget): SLADefinition {
  return {
    id: target.id,
    name: target.name,
    description: target.description,
    status: 'unknown',
    overallCompliance: null,
    agents: target.agents,
    metrics: [],
    measurementWindow: asMeasurementWindow(target.measurement_window) ?? 'monthly',
    breachThreshold: null,
    notificationChannels: [],
    createdDate: isoDate(target.created_at),
    lastUpdated: isoDate(target.updated_at),
    windowRemaining: '—',
  };
}

function mapBreach(b: WireSLABreach): Breach {
  const startMs = Date.parse(b.breach_start);
  const endMs = b.breach_end ? Date.parse(b.breach_end) : Date.now();
  // A breach is resolved once it has an end time; otherwise acknowledged or active.
  const status: BreachStatus = b.breach_end ? 'resolved' : b.acknowledged ? 'acknowledged' : 'active';

  return {
    id: b.id,
    slaId: b.sla_id,
    slaName: b.sla_name,
    metricName: b.metric_name ?? undefined,
    severity: BREACH_SEVERITIES.find(s => s === b.severity),
    startTime: b.breach_start,
    endTime: b.breach_end ?? undefined,
    duration: formatDuration(endMs - startMs),
    status,
    rootCause: b.root_cause ?? undefined,
    resolutionNotes: b.remediation ?? undefined,
    // The backend breach record has no per-agent impact list.
    impactedAgents: [],
  };
}

function mapErrorBudget(b: WireSLAErrorBudget): ErrorBudget {
  return {
    slaId: b.sla_id,
    slaName: b.sla_name,
    totalBudgetMinutes: b.total_budget_minutes ?? undefined,
    usedBudgetMinutes: b.used_budget_minutes ?? undefined,
    remainingPercent: b.remaining_pct,
    burnRate: b.burn_rate ?? undefined,
    burnRateTrend: BURN_TRENDS.find(t => t === b.burn_rate_trend),
    projectedExhaustion: b.projected_exhaustion ? isoDate(b.projected_exhaustion) : undefined,
    history: (b.history ?? [])
      .filter(h => typeof h.date === 'string' && typeof h.remaining === 'number')
      .map(h => ({ date: h.date as string, remaining: h.remaining as number })),
  };
}

/**
 * The API returns one report for the requested window, not a list of periods.
 * Compliance % and the met/missed split derive from simulated measurements, so
 * they map to null; SLA count and breach count are real.
 */
function mapComplianceReport(report: WireSLAComplianceReport): ComplianceReport[] {
  const start = isoDate(report.report_period_start);
  const end = isoDate(report.report_period_end);
  return [
    {
      id: `rpt-${start || 'current'}`,
      period: start && end ? `${start} to ${end}` : 'Current period',
      overallCompliance: null,
      slasMet: null,
      slasTotal: report.slas.length,
      breachCount: report.total_breaches,
      avgResolutionTime: '—',
      generatedDate: end,
    },
  ];
}

/** Infer the backend metric_type / target_unit pair from a UI metric row. */
function inferMetricType(metric: { name: string; unit: string }): string {
  const name = metric.name.toLowerCase();
  if (/availability|uptime/.test(name)) return 'availability';
  if (/error/.test(name)) return 'error_rate';
  if (/throughput|req/.test(name)) return 'throughput';
  if (/latency|response|time|duration/.test(name) || metric.unit === 'ms' || metric.unit === 's') return 'latency';
  return 'availability';
}

function inferTargetUnit(unit: string): string {
  if (unit === 'ms' || unit === 's') return 'ms';
  if (unit === '%') return 'percent';
  return 'count';
}

// ─── Requests ───

async function fetchSLAs(): Promise<WireSLAListResponse> {
  const res = await fetch(`${OPS_BASE}/sla`);
  if (!res.ok) throw new Error(`SLA fetch failed: ${res.status}`);
  return res.json();
}

async function fetchBreaches(days = 30): Promise<WireSLABreachesResponse> {
  const res = await fetch(`${OPS_BASE}/sla/breaches?days=${days}`);
  if (!res.ok) throw new Error(`Breach fetch failed: ${res.status}`);
  return res.json();
}

async function fetchErrorBudgets(): Promise<WireSLAErrorBudgetsResponse> {
  const res = await fetch(`${OPS_BASE}/sla/error-budgets`);
  if (!res.ok) throw new Error(`Error budget fetch failed: ${res.status}`);
  return res.json();
}

async function fetchComplianceReport(days: number): Promise<WireSLAComplianceReport> {
  const res = await fetch(`${OPS_BASE}/sla/compliance?days=${days}`);
  if (!res.ok) throw new Error(`Compliance fetch failed: ${res.status}`);
  return res.json();
}

/**
 * Create SLA targets. A backend SLA target holds a single metric, so a request
 * carrying several metrics (e.g. from a template) creates one target per metric,
 * suffixed with the metric name so the definitions stay distinguishable.
 */
async function createSLATargets(request: SLACreateRequest): Promise<SLADefinition[]> {
  if (request.metrics.length === 0) {
    throw new Error('SLA create requires at least one metric target');
  }

  const multi = request.metrics.length > 1;
  const created: SLADefinition[] = [];

  for (const metric of request.metrics) {
    const payload = {
      name: multi ? `${request.name} (${metric.name})` : request.name,
      description: request.description,
      metric_type: inferMetricType(metric),
      target_value: metric.target,
      target_unit: inferTargetUnit(metric.unit),
      measurement_window: request.measurementWindow,
      services: [],
      agents: request.agents,
    };
    const res = await fetch(`${OPS_BASE}/sla`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`SLA create failed: ${res.status}`);
    created.push(mapCreatedSLA(await res.json()));
  }

  return created;
}

async function acknowledgeBreach(breachId: string): Promise<Breach> {
  const res = await fetch(`${OPS_BASE}/sla/breaches/${encodeURIComponent(breachId)}/acknowledge`, {
    method: 'PATCH',
  });
  if (!res.ok) throw new Error(`Breach acknowledge failed: ${res.status}`);
  return mapBreach(await res.json());
}

async function resolveBreach(breachId: string, resolutionNotes: string): Promise<Breach> {
  const res = await fetch(`${OPS_BASE}/sla/breaches/${encodeURIComponent(breachId)}/resolve`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolution_notes: resolutionNotes }),
  });
  if (!res.ok) throw new Error(`Breach resolve failed: ${res.status}`);
  return mapBreach(await res.json());
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hooks
// ═══════════════════════════════════════════════════════════════════════════════

export interface UseSLAsResult {
  slas: SLADefinition[];
  errorBudgets: ErrorBudget[];
  loading: boolean;
  error: string | null;
  isLive: boolean;
  source: string;
  /** Provenance of the error-budget list, which degrades independently of the SLA list. */
  budgetsLive: boolean;
  budgetsSource: string;
  budgetsNote?: string;
  refresh: () => void;
  createSLA: (request: SLACreateRequest) => Promise<SLADefinition>;
}

/**
 * Hook for fetching the SLA list plus error-budget positions.
 *
 * The SLA list and the error budgets are joined on sla_id, so live SLAs are only
 * rendered when both requests succeed and the API reports live data; otherwise
 * the hook keeps the mock set and reports Demo.
 */
export function useSLAs(pollIntervalMs = 60_000): UseSLAsResult {
  const [slas, setSlas] = useState<SLADefinition[]>(MOCK_SLAS);
  const [errorBudgets, setErrorBudgets] = useState<ErrorBudget[]>(MOCK_ERROR_BUDGETS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [source, setSource] = useState('demo');
  const [budgetsLive, setBudgetsLive] = useState(false);
  const [budgetsSource, setBudgetsSource] = useState('demo');
  const [budgetsNote, setBudgetsNote] = useState<string | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState(0);

  const { updateSource } = useDataSources();
  const pollingKey = usePollingKey(pollIntervalMs);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      // Don't show loading spinner on subsequent polls
      if (refreshKey === 0) setLoading(true);

      try {
        const [slaResponse, budgetResponse] = await Promise.allSettled([
          fetchSLAs(),
          fetchErrorBudgets(),
        ]);

        if (cancelled) return;

        const budgets = budgetResponse.status === 'fulfilled' ? budgetResponse.value : null;

        // Error budgets: the API reports live=false while measured values are
        // simulated, so honour its flag rather than assuming live.
        // Same correction: honour the API's live flag rather than requiring rows, so a
        // live-but-empty budget response is not replaced by MOCK_ERROR_BUDGETS.
        if (budgets && budgets.live) {
          setErrorBudgets(budgets.budgets.map(mapErrorBudget));
          setBudgetsLive(true);
          setBudgetsSource(budgets.source);
          setBudgetsNote(budgets.note ?? undefined);
        } else {
          setErrorBudgets(MOCK_ERROR_BUDGETS);
          setBudgetsLive(false);
          setBudgetsSource(budgets?.source ?? 'demo');
          setBudgetsNote(budgets?.note ?? undefined);
        }

        // SLA list: needs the budget response too, since that is where the
        // per-SLA metric type and measurement window come from.
        const slaList = slaResponse.status === 'fulfilled' ? slaResponse.value : null;
        if (slaList && slaList.live && slaList.slas.length > 0 && budgets) {
          setSlas(mapSLAs(slaList, budgets.budgets));
          setIsLive(true);
          setSource(slaList.source);
        } else {
          setSlas(MOCK_SLAS);
          setIsLive(false);
          setSource('demo');
        }

        updateSource('aws-cloudwatch', {
          status: slaList?.live ? 'live' : 'demo',
          lastFetch: Date.now(),
        });

        setError(
          slaResponse.status === 'rejected'
            ? slaResponse.reason instanceof Error
              ? slaResponse.reason.message
              : 'Failed to fetch SLAs'
            : null,
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch SLAs');
          // Keep using current data (mock or last successful fetch)
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [refreshKey, pollingKey, updateSource]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const handleCreateSLA = useCallback(async (request: SLACreateRequest): Promise<SLADefinition> => {
    try {
      const created = await createSLATargets(request);
      setSlas(prev => [...prev, ...created]);
      return created[0];
    } catch {
      // For demo mode, create locally. Nothing has been measured, so the new SLA
      // reports 'unknown' rather than claiming it is already meeting its target.
      const demoSla: SLADefinition = {
        id: `sla-${Date.now()}`,
        name: request.name,
        description: request.description,
        status: 'unknown',
        overallCompliance: null,
        agents: request.agents,
        metrics: request.metrics.map(m => ({ ...m, current: m.target, trend: [m.target] })),
        measurementWindow: request.measurementWindow,
        breachThreshold: null,
        notificationChannels: request.notificationChannels,
        template: request.templateId,
        createdDate: new Date().toISOString().split('T')[0],
        lastUpdated: new Date().toISOString().split('T')[0],
        windowRemaining: '—',
      };
      setSlas(prev => [...prev, demoSla]);
      return demoSla;
    }
  }, []);

  return {
    slas,
    errorBudgets,
    loading,
    error,
    isLive,
    source,
    budgetsLive,
    budgetsSource,
    budgetsNote,
    refresh,
    createSLA: handleCreateSLA,
  };
}

export interface UseSLABreachesResult {
  breaches: Breach[];
  activeCount: number;
  acknowledgedCount: number;
  resolvedCount: number;
  loading: boolean;
  error: string | null;
  isLive: boolean;
  source: string;
  refresh: () => void;
  acknowledge: (breachId: string) => Promise<void>;
  resolve: (breachId: string, notes: string) => Promise<void>;
}

/**
 * Hook for managing SLA breaches with acknowledge/resolve actions.
 */
export function useSLABreaches(pollIntervalMs = 30_000): UseSLABreachesResult {
  const [breaches, setBreaches] = useState<Breach[]>(MOCK_BREACHES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [source, setSource] = useState('demo');
  const [refreshKey, setRefreshKey] = useState(0);

  const pollingKey = usePollingKey(pollIntervalMs);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      if (refreshKey === 0) setLoading(true);

      try {
        const response = await fetchBreaches();
        if (cancelled) return;
        // Breach records are real DynamoDB rows; render them when the API says live.
        // NOT `&& response.breaches.length > 0`: a live response with zero breaches is the
        // best possible news, and requiring a non-empty list replaced it with three
        // fabricated breaches (INC-2847/INC-2846) while flipping the badge to demo. An
        // empty live result is an honest empty state.
        if (response.live) {
          setBreaches(response.breaches.map(mapBreach));
          setIsLive(true);
          setSource(response.source);
        } else {
          setBreaches(MOCK_BREACHES);
          setIsLive(false);
          setSource('demo');
        }
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch breaches');
          setBreaches(MOCK_BREACHES);
          setIsLive(false);
          setSource('demo');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [refreshKey, pollingKey]);

  const counts = useMemo(() => ({
    activeCount: breaches.filter(b => b.status === 'active').length,
    acknowledgedCount: breaches.filter(b => b.status === 'acknowledged').length,
    resolvedCount: breaches.filter(b => b.status === 'resolved').length,
  }), [breaches]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const acknowledge = useCallback(async (breachId: string) => {
    try {
      const updated = await acknowledgeBreach(breachId);
      setBreaches(prev => prev.map(b => b.id === breachId ? updated : b));
    } catch {
      // Demo mode: update locally
      setBreaches(prev => prev.map(b =>
        b.id === breachId ? { ...b, status: 'acknowledged' as BreachStatus } : b
      ));
    }
  }, []);

  const resolve = useCallback(async (breachId: string, notes: string) => {
    try {
      const updated = await resolveBreach(breachId, notes);
      setBreaches(prev => prev.map(b => b.id === breachId ? updated : b));
    } catch {
      // Demo mode: update locally
      setBreaches(prev => prev.map(b =>
        b.id === breachId ? {
          ...b,
          status: 'resolved' as BreachStatus,
          endTime: new Date().toISOString(),
          resolutionNotes: notes,
        } : b
      ));
    }
  }, []);

  return {
    breaches,
    ...counts,
    loading,
    error,
    isLive,
    source,
    refresh,
    acknowledge,
    resolve,
  };
}

export interface UseSLAComplianceResult {
  reports: ComplianceReport[];
  loading: boolean;
  error: string | null;
  isLive: boolean;
  source: string;
  refresh: () => void;
}

/** Named reporting periods mapped to the `days` window the API accepts. */
const PERIOD_DAYS: Record<string, number> = {
  current: 30,
  '7d': 7,
  '30d': 30,
  '90d': 90,
  quarter: 90,
};

/**
 * Hook for fetching the SLA compliance report for a given period.
 */
export function useSLACompliance(period = 'current'): UseSLAComplianceResult {
  const [reports, setReports] = useState<ComplianceReport[]>(MOCK_COMPLIANCE_REPORTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [source, setSource] = useState('demo');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);

      try {
        const response = await fetchComplianceReport(PERIOD_DAYS[period] ?? 30);
        if (cancelled) return;
        if (response.live && response.slas.length > 0) {
          setReports(mapComplianceReport(response));
          setIsLive(true);
          setSource(response.source);
        } else {
          setReports(MOCK_COMPLIANCE_REPORTS);
          setIsLive(false);
          setSource('demo');
        }
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch compliance reports');
          setReports(MOCK_COMPLIANCE_REPORTS);
          setIsLive(false);
          setSource('demo');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [period, refreshKey]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return { reports, loading, error, isLive, source, refresh };
}
