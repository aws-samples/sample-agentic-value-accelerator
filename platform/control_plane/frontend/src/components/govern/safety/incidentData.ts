/**
 * incidentData — the AI-incident LIFECYCLE for the Safety module.
 *
 * This is distinct from the append-only audit log (/govern/audit), which is the
 * immutable evidence trail. Here we track the *lifecycle* of an AI incident:
 * detect → triage → mitigate → resolve → report, plus NEAR-MISS capture (events
 * that could have become incidents but didn't — the leading indicator).
 *
 * Grounding:
 *  - CoSAI (OASIS) WS2 — AI Incident Response Framework (lifecycle stages).
 *  - AIID / OECD AI Incidents Monitor — incident taxonomy & severity framing.
 *  - EU AI Act Article 73 — serious-incident reporting clocks. For high-risk AI
 *    systems, providers must report a "serious incident" to the market
 *    surveillance authority without undue delay and within statutory deadlines:
 *      • 2 days  — widespread infringement / serious-and-irreversible disruption
 *                  of critical infrastructure.
 *      • 10 days — where the incident resulted in a person's death.
 *      • 15 days — general serious incident (default clock).
 *    These obligations apply from 2026-08-02.
 *
 * Illustrative data — the audit log it reads from is real; these incident
 * records are demo fixtures. Dates are FIXED ISO strings (never Date.now()).
 */

export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'near-miss';

export type IncidentCategory =
  | 'harmful-output'
  | 'pii-exposure'
  | 'prompt-injection'
  | 'hallucination'
  | 'availability'
  | 'bias';

export type IncidentStatus =
  | 'detected'
  | 'triaging'
  | 'mitigating'
  | 'resolved'
  | 'reported';

/** EU AI Act Art. 73 statutory clock, in calendar days (null = not reportable). */
export type ReportClockDays = 2 | 10 | 15 | null;

export interface Incident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  category: IncidentCategory;
  status: IncidentStatus;
  /** Agent or model affected. */
  affected: string;
  /** ISO date the incident was detected (fixed string, not Date.now()). */
  detectedAt: string;
  /** Does EU AI Act Article 73 serious-incident reporting apply? */
  reportable: boolean;
  /** Statutory clock in days (2/10/15) or null when not reportable. */
  reportClockDays: ReportClockDays;
  /** Fixed ISO deadline string, or 'n/a' when not reportable. */
  reportDeadline: string;
  summary: string;
  remediation: string;
}

/**
 * Illustrative incident lifecycle records. "Today" for this fixture set is
 * 2026-08-05 (just after Art. 73 enters force on 2026-08-02), so the reporting
 * clocks below are meaningful relative to that reference point.
 */
export const INCIDENT_FIXTURE_TODAY = '2026-08-05';

export const INCIDENTS: Incident[] = [
  {
    id: 'INC-2026-0041',
    title: 'Claims-triage agent emitted unsafe medical guidance',
    severity: 'critical',
    category: 'harmful-output',
    status: 'reported',
    affected: 'claims-triage-agent (Claude on Bedrock)',
    detectedAt: '2026-08-01',
    reportable: true,
    reportClockDays: 15,
    reportDeadline: '2026-08-16',
    summary:
      'A customer-facing triage agent produced health guidance outside its approved scope after a jailbreak-style prompt. No physical harm resulted, but the output could have caused serious harm — classified serious under Art. 73.',
    remediation:
      'Guardrail policy tightened (denied-topics + content filter), scope prompt hardened, red-team regression added. Reported to market-surveillance authority within the 15-day clock.',
  },
  {
    id: 'INC-2026-0043',
    title: 'PII leaked in RAG response via unredacted knowledge-base chunk',
    severity: 'high',
    category: 'pii-exposure',
    status: 'mitigating',
    affected: 'customer-support-copilot (RAG)',
    detectedAt: '2026-08-03',
    reportable: true,
    reportClockDays: 15,
    reportDeadline: '2026-08-18',
    summary:
      'A retrieval chunk containing another customer\'s account details surfaced in a support response. Root cause: a knowledge-base document ingested without PII redaction. Contained to a single session.',
    remediation:
      'Affected document quarantined; PII-redaction guardrail applied at ingest; retrieval index re-scanned. Data-protection review in progress; serious-incident report being prepared under the 15-day clock.',
  },
  {
    id: 'INC-2026-0044',
    title: 'Indirect prompt injection via crafted email attachment',
    severity: 'high',
    category: 'prompt-injection',
    status: 'triaging',
    affected: 'inbox-automation-agent',
    detectedAt: '2026-08-04',
    reportable: false,
    reportClockDays: null,
    reportDeadline: 'n/a',
    summary:
      'An inbound email attachment contained hidden instructions attempting to redirect the agent to exfiltrate thread contents. Tool-use policy blocked the outbound action; no data left the boundary.',
    remediation:
      'Under triage: adding content provenance checks and an untrusted-content sandbox. Not reportable (no serious incident occurred — blocked pre-execution), tracked as a strong candidate near-miss escalation.',
  },
  {
    id: 'INC-2026-0039',
    title: 'Financial-summary agent hallucinated a non-existent regulation',
    severity: 'medium',
    category: 'hallucination',
    status: 'resolved',
    affected: 'reg-reporting-assistant',
    detectedAt: '2026-07-24',
    reportable: false,
    reportClockDays: null,
    reportDeadline: 'n/a',
    summary:
      'The assistant cited a fabricated regulatory clause in an internal draft. Caught by a human reviewer before external use; no downstream impact.',
    remediation:
      'Grounding-only mode enforced for regulatory content; citation-verification eval added to the release gate. Resolved.',
  },
  {
    id: 'NM-2026-0012',
    title: 'Near-miss: kill-switch drill caught runaway tool-call loop',
    severity: 'near-miss',
    category: 'availability',
    status: 'resolved',
    affected: 'batch-enrichment-agent',
    detectedAt: '2026-07-30',
    reportable: false,
    reportClockDays: null,
    reportDeadline: 'n/a',
    summary:
      'An agent entered a repeated tool-call loop during a load test. Rate-limit + circuit-breaker halted it before any production impact — a near-miss, not an incident. Captured as a leading indicator.',
    remediation:
      'Loop-detection threshold lowered; per-agent tool-call budget added. Logged as near-miss to feed the safety case and threat model.',
  },
  {
    id: 'NM-2026-0013',
    title: 'Near-miss: bias drift detected in loan pre-screening scores',
    severity: 'near-miss',
    category: 'bias',
    status: 'triaging',
    affected: 'loan-prescreen-model',
    detectedAt: '2026-08-02',
    reportable: false,
    reportClockDays: null,
    reportDeadline: 'n/a',
    summary:
      'Fairness monitoring flagged a widening demographic-parity gap approaching the alert threshold. No decisions were affected — surfaced before breaching bounds.',
    remediation:
      'Under triage: model owner reviewing feature drift; fairness re-eval scheduled. Cross-linked to Model Explainability. Near-miss, not a reportable incident.',
  },
];

export interface IncidentCounts {
  total: number;
  /** Open = anything not resolved and not already reported-closed. */
  open: number;
  nearMisses: number;
  reportable: number;
  resolved: number;
  reported: number;
  bySeverity: Record<IncidentSeverity, number>;
  byStatus: Record<IncidentStatus, number>;
  byCategory: Record<IncidentCategory, number>;
  /** Reportable incidents whose deadline is within `approachingWindowDays`. */
  approachingDeadline: number;
}

const SEVERITIES: IncidentSeverity[] = ['critical', 'high', 'medium', 'near-miss'];
const STATUSES: IncidentStatus[] = ['detected', 'triaging', 'mitigating', 'resolved', 'reported'];
const CATEGORIES: IncidentCategory[] = [
  'harmful-output',
  'pii-exposure',
  'prompt-injection',
  'hallucination',
  'availability',
  'bias',
];

/** A status counts as "open" if the lifecycle hasn't closed out. */
const OPEN_STATUSES: IncidentStatus[] = ['detected', 'triaging', 'mitigating'];

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return Number.POSITIVE_INFINITY;
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

export function computeIncidentCounts(
  incidents: Incident[] = INCIDENTS,
  today: string = INCIDENT_FIXTURE_TODAY,
  approachingWindowDays = 7,
): IncidentCounts {
  const bySeverity = Object.fromEntries(SEVERITIES.map(s => [s, 0])) as Record<IncidentSeverity, number>;
  const byStatus = Object.fromEntries(STATUSES.map(s => [s, 0])) as Record<IncidentStatus, number>;
  const byCategory = Object.fromEntries(CATEGORIES.map(c => [c, 0])) as Record<IncidentCategory, number>;

  let open = 0;
  let nearMisses = 0;
  let reportable = 0;
  let resolved = 0;
  let reported = 0;
  let approachingDeadline = 0;

  for (const inc of incidents) {
    bySeverity[inc.severity] += 1;
    byStatus[inc.status] += 1;
    byCategory[inc.category] += 1;

    if (OPEN_STATUSES.includes(inc.status)) open += 1;
    if (inc.severity === 'near-miss') nearMisses += 1;
    if (inc.status === 'resolved') resolved += 1;
    if (inc.status === 'reported') reported += 1;

    if (inc.reportable) {
      reportable += 1;
      // Approaching = deadline within the window AND lifecycle not yet reported.
      if (inc.reportDeadline !== 'n/a' && inc.status !== 'reported') {
        const remaining = daysBetween(today, inc.reportDeadline);
        if (remaining >= 0 && remaining <= approachingWindowDays) approachingDeadline += 1;
      }
    }
  }

  return {
    total: incidents.length,
    open,
    nearMisses,
    reportable,
    resolved,
    reported,
    bySeverity,
    byStatus,
    byCategory,
    approachingDeadline,
  };
}

/** Human-readable labels for categories/statuses (used in the table). */
export const CATEGORY_LABELS: Record<IncidentCategory, string> = {
  'harmful-output': 'Harmful output',
  'pii-exposure': 'PII exposure',
  'prompt-injection': 'Prompt injection',
  hallucination: 'Hallucination',
  availability: 'Availability',
  bias: 'Bias / fairness',
};

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  detected: 'Detected',
  triaging: 'Triaging',
  mitigating: 'Mitigating',
  resolved: 'Resolved',
  reported: 'Reported',
};

export const SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  'near-miss': 'Near-miss',
};
