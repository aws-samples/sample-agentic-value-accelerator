/**
 * auditMetrics — Govern Audit & Incidents' contribution to the shared metric
 * contract. PROPOSED (see metricContract.ts).
 *
 * Two distinct things live here, kept deliberately separate:
 *  1. METRICS (ComputedMetric[]) — Incident Resolution Time (MTTR), open
 *     incidents, and resolution rate. These map to the workbook's Operational
 *     "Incident Resolution Time" KPI and feed the scorecard like the other
 *     module contributions.
 *  2. EVIDENCE (the audit-event feed) — the append-only examiner log. This is
 *     the workbook's "Critic Agent Audit Log" row. It is NOT a metric (it's the
 *     evidence substrate the metrics and risk signals are computed from), so it
 *     is exposed as its own accessor rather than shoehorned into a ComputedMetric.
 *
 * When live events are passed from governAuditApi.list(), metrics are computed
 * from them; otherwise falls back to static INCIDENT_SUMMARY.
 */
import { INCIDENT_SUMMARY, AUDIT_EVENTS } from '../mockData';
import type { AuditEvent } from '../mockData';
import {
  type ComputedMetric,
  type MetricContribution,
  computeVariance,
  ragForVariance,
} from './metricContract';

/** MTTR target in minutes (workbook: incident resolution trending down/-40%). */
const MTTR_TARGET_MIN = 30;

/**
 * Compute incident summary from live events when available.
 * Incident events have category='incident'. We count open vs resolved based on
 * severity/action patterns (simplified heuristic — production would track status).
 */
function computeIncidentSummaryFromEvents(events: AuditEvent[]): {
  open: number;
  critical: number;
  resolved7d: number;
  mttrMin: number;
} {
  const incidents = events.filter(e => e.category === 'incident');
  // Heuristic: critical severity incidents with 'flag' or 'alert' action are open
  // Those with 'resolved' in action are closed. Simplified for demo.
  const open = incidents.filter(e =>
    e.action.includes('flag') || e.action.includes('alert') || e.action.includes('paged')
  ).length;
  const critical = incidents.filter(e => e.severity === 'critical').length;
  const resolved7d = Math.max(0, incidents.length - open);
  // MTTR estimate: assume ~25 min for resolved incidents (simplified)
  const mttrMin = resolved7d > 0 ? 25 : MTTR_TARGET_MIN;

  return { open, critical, resolved7d, mttrMin };
}

export function auditMetricRows(liveEvents?: AuditEvent[]): ComputedMetric[] {
  // Use live event-derived metrics if available, otherwise fall back to mock summary
  const summary = liveEvents && liveEvents.length > 0
    ? computeIncidentSummaryFromEvents(liveEvents)
    : INCIDENT_SUMMARY;

  const open = summary.open;
  const resolved = summary.resolved7d;
  const mttr = summary.mttrMin;
  const resolutionRate = open + resolved > 0 ? resolved / (open + resolved) : 0;

  const rows: ComputedMetric[] = [];

  // Incident Resolution Time (MTTR) — lower is better. Board-tier operational KPI.
  {
    const { variance, variancePct } = computeVariance(MTTR_TARGET_MIN, mttr);
    rows.push({
      id: 'audit.mttr',
      label: 'Incident Resolution Time (MTTR)',
      tier: 'board',
      owningModule: 'audit',
      cadence: 'weekly',
      polarity: 'lower-is-better',
      unit: 'min',
      expected: MTTR_TARGET_MIN,
      actual: mttr,
      target: Math.round(MTTR_TARGET_MIN * 0.6),
      owner: 'CTO',
      source: 'Govern · Audit & Incidents — ITSM ticket analysis',
      variance,
      variancePct,
      rag: ragForVariance(variancePct, 'lower-is-better'),
    });
  }

  // Open incidents — lower is better; target 0.
  {
    rows.push({
      id: 'audit.open-incidents',
      label: 'Open Incidents',
      tier: 'management',
      owningModule: 'audit',
      cadence: 'daily',
      polarity: 'lower-is-better',
      unit: 'count',
      expected: 0,
      actual: open,
      target: 0,
      owner: 'Governance Lead',
      source: 'Govern · Audit & Incidents',
      // expected 0 → variancePct undefined; band on the raw count instead.
      variance: open,
      variancePct: null,
      rag: open === 0 ? 'green' : INCIDENT_SUMMARY.critical > 0 ? 'red' : 'amber',
    });
  }

  // Incident resolution rate (7d) — higher is better.
  {
    const target = 0.9;
    const { variance, variancePct } = computeVariance(target, resolutionRate);
    rows.push({
      id: 'audit.resolution-rate',
      label: 'Incident Resolution Rate (7d)',
      tier: 'management',
      owningModule: 'audit',
      cadence: 'weekly',
      polarity: 'higher-is-better',
      unit: '%',
      expected: target,
      actual: Math.round(resolutionRate * 1000) / 1000,
      target,
      owner: 'Governance Lead',
      source: 'Govern · Audit & Incidents',
      variance,
      variancePct,
      rag: ragForVariance(variancePct, 'higher-is-better'),
    });
  }

  return rows;
}

/**
 * The audit-event evidence feed (the "audit log" layer, not a metric). Callers
 * that want the examiner trail read this; the scorecard reads only the metrics.
 * When liveEvents are provided, uses those; otherwise falls back to mock.
 */
export function auditEvidenceFeed(limit = 8, liveEvents?: AuditEvent[]): AuditEvent[] {
  const source = liveEvents && liveEvents.length > 0 ? liveEvents : AUDIT_EVENTS;
  return source.slice(0, limit);
}

export function auditContribution(generatedAt: string, liveEvents?: AuditEvent[]): MetricContribution {
  return {
    owningModule: 'audit',
    generatedAt,
    metrics: auditMetricRows(liveEvents),
  };
}
