/**
 * graduationData — "Earned Autonomy" graduation model for Human Oversight.
 *
 * Computes whether an agent has performed safely enough to graduate to a lower
 * level of human oversight (step up the L1→L4 scope ladder), and the triggers
 * that should step it back down. Modeled on the DeploymentGate verdict pattern
 * (cleared/conditional/blocked → ready/conditional/not_ready) and grounded in
 * the AWS Agentic AI Security Scoping Matrix's "progressive autonomy" principle.
 *
 * Self-contained in the Govern module. Uses a deterministic synthetic track
 * record per agent (no Math.random) so the graduation UX can be demonstrated
 * before real track-record signals (time-in-scope, guardrail-intervention rate,
 * human-agreement history) exist in the agent data model.
 */
import { AGENT_SCOPE_META, type AgentScopeLevel } from './autonomyLadder';

export type GraduationVerdict = 'ready' | 'conditional' | 'not_ready';
export type CriterionStatus = 'pass' | 'warning' | 'fail';

/**
 * How oversight CHANGES MODE on promotion to a given target level.
 * Grounded in the AWS Agentic AI Security Scoping Matrix + EU AI Act Art. 14(3):
 * per-action human approval steps down as autonomy rises, but audit/monitoring
 * intensity steps UP — oversight transforms, it does not disappear. Keyed by the
 * target scope level being graduated INTO.
 */
export interface OversightShift {
  /** What per-action human involvement is reduced/removed at the target level. */
  relaxes: string;
  /** What monitoring/audit/control must intensify to compensate. */
  intensifies: string;
}

export const OVERSIGHT_SHIFT: Record<AgentScopeLevel, OversightShift> = {
  1: {
    relaxes: 'Nothing — L1 is read-only/advisory; a human still acts on every recommendation.',
    intensifies: 'Output logging and periodic review of recommendation quality.',
  },
  2: {
    relaxes: 'Human no longer authors the action — the agent drafts it. Approval is still required per action (HITL).',
    intensifies: 'Approval-workflow audit trail and draft-vs-approved divergence monitoring.',
  },
  3: {
    relaxes: 'Per-action approval drops to exception-only — the agent executes within guardrails after human initiation.',
    intensifies: 'Continuous behavioral baselines, risk-threshold escalation, and an always-available stop/override path (on-the-loop).',
  },
  4: {
    relaxes: 'Real-time human involvement ends within the authorized domain — the agent can self-initiate.',
    intensifies: 'Highest governance: tamper-proof override, failsafe halt on confidence drop, continuous monitoring, and elevated independent challenge (out-of-the-loop + audit).',
  },
};

export interface GraduationCriterion {
  label: string;
  requirement: string;
  value: string;
  status: CriterionStatus;
  blocking: boolean;
  detail?: string;
}

export interface AgentGraduation {
  agentId: string;
  name: string;
  businessUnit: string;
  currentLevel: AgentScopeLevel;
  targetLevel: AgentScopeLevel | null;   // null if already at L4
  verdict: GraduationVerdict;
  readiness: number;                      // 0-100, for ranking
  criteria: GraduationCriterion[];
  summary: string;
  // Track-record signals (synthetic but deterministic)
  decisionsInScope: number;
  daysInScope: number;
  incidentRate: number;                   // per 1k decisions
  openIncidents: number;
  errorRate: number;                      // %
  guardrailInterventionRate: number;      // %
  agreementRate: number;                  // % human approved as proposed
  agreementTrend: 'rising' | 'flat' | 'falling';
  hasPolicy: boolean;
  reviewerHoursPerMonth: number;          // reclaimable if graduated
  // Step-down (independent of graduation)
  stepDown: { triggered: boolean; reason?: string };
  reclaimable: boolean;
}

// Deterministic [0,1) pseudo-noise.
function noise(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// Per-target-level graduation thresholds (stricter as autonomy rises).
const THRESHOLDS: Record<number, {
  decisions: number; days: number; maxIncidentRate: number; maxErrorRate: number;
  maxGuardrail: number; minAgreement: number;
}> = {
  // target L2 (from L1)
  2: { decisions: 200,  days: 14, maxIncidentRate: 2.0, maxErrorRate: 3.0, maxGuardrail: 2.0, minAgreement: 85 },
  // target L3 (from L2)
  3: { decisions: 500,  days: 30, maxIncidentRate: 1.0, maxErrorRate: 2.0, maxGuardrail: 1.0, minAgreement: 90 },
  // target L4 (from L3)
  4: { decisions: 5000, days: 90, maxIncidentRate: 0.2, maxErrorRate: 1.0, maxGuardrail: 0.5, minAgreement: 95 },
};

function verdictFrom(criteria: GraduationCriterion[]): GraduationVerdict {
  if (criteria.some(c => c.blocking && c.status === 'fail')) return 'not_ready';
  if (criteria.some(c => c.status !== 'pass')) return 'conditional';
  return 'ready';
}

const BUSINESS_UNITS = [
  'Retail Banking', 'Capital Markets', 'Wealth Management', 'Risk & Fraud',
  'Operations', 'Customer Service', 'Compliance', 'Insurance',
];

/** Generate a deterministic graduation record for one synthetic agent. */
function buildAgent(i: number): AgentGraduation {
  const bu = BUSINESS_UNITS[i % BUSINESS_UNITS.length];
  const sr = noise(i * 3 + 1);
  const currentLevel: AgentScopeLevel = sr < 0.45 ? 2 : sr < 0.8 ? 3 : sr < 0.95 ? 1 : 4;
  const targetLevel = (currentLevel < 4 ? (currentLevel + 1) : null) as AgentScopeLevel | null;

  const decisionsInScope = Math.round(200 + noise(i * 3 + 2) * 9000);
  const daysInScope = Math.round(5 + noise(i * 3 + 3) * 160);
  const openIncidents = noise(i * 5 + 4) > 0.9 ? 1 + Math.floor(noise(i * 5 + 5) * 2) : 0;
  const incidentRate = +(noise(i * 7 + 6) * 2.5).toFixed(2);
  const errorRate = +(noise(i * 7 + 7) * 3.5).toFixed(2);
  const guardrailInterventionRate = +(noise(i * 7 + 8) * 2.2).toFixed(2);
  const agreementRate = Math.round(78 + noise(i * 11 + 9) * 21); // 78-99%
  const tr = noise(i * 11 + 10);
  const agreementTrend = tr < 0.2 ? 'falling' : tr < 0.55 ? 'flat' : 'rising';
  const hasPolicy = noise(i * 13 + 11) > 0.12;
  const reviewerHoursPerMonth = Math.round(10 + noise(i * 13 + 12) * 80);

  // Step-down evaluation (independent of graduation eligibility).
  let stepDown = { triggered: false, reason: undefined as string | undefined };
  if (openIncidents > 0 && currentLevel >= 3) stepDown = { triggered: true, reason: 'Open incident at high autonomy' };
  else if (agreementTrend === 'falling' && currentLevel >= 3) stepDown = { triggered: true, reason: 'Human agreement declining' };
  else if (errorRate > 3 && currentLevel >= 3) stepDown = { triggered: true, reason: 'Error rate spike' };

  const t = targetLevel ? THRESHOLDS[targetLevel] : null;
  const criteria: GraduationCriterion[] = [];
  if (t && targetLevel) {
    const pf = (ok: boolean, blocking = true): CriterionStatus => (ok ? 'pass' : blocking ? 'fail' : 'warning');
    criteria.push(
      { label: 'Decisions in current scope', requirement: `≥ ${t.decisions.toLocaleString()}`, value: decisionsInScope.toLocaleString(), status: pf(decisionsInScope >= t.decisions), blocking: true },
      { label: 'Time at current level', requirement: `≥ ${t.days}d`, value: `${daysInScope}d`, status: pf(daysInScope >= t.days), blocking: true },
      { label: 'Open incidents', requirement: '0', value: String(openIncidents), status: pf(openIncidents === 0), blocking: true },
      { label: 'Incident rate', requirement: `≤ ${t.maxIncidentRate}/1k`, value: `${incidentRate}/1k`, status: pf(incidentRate <= t.maxIncidentRate, false), blocking: false },
      { label: 'Error rate', requirement: `≤ ${t.maxErrorRate}%`, value: `${errorRate}%`, status: pf(errorRate <= t.maxErrorRate, false), blocking: false },
      { label: 'Guardrail intervention rate', requirement: `≤ ${t.maxGuardrail}%`, value: `${guardrailInterventionRate}%`, status: pf(guardrailInterventionRate <= t.maxGuardrail, false), blocking: false },
      { label: 'Human agreement rate', requirement: `≥ ${t.minAgreement}%`, value: `${agreementRate}% ${agreementTrend === 'rising' ? '▲' : agreementTrend === 'falling' ? '▼' : ''}`.trim(), status: pf(agreementRate >= t.minAgreement && agreementTrend !== 'falling'), blocking: true, detail: agreementRate >= t.minAgreement ? 'Reviewers approve nearly everything proposed — oversight adds little marginal safety.' : 'Reviewers still overturn enough proposals that the human is adding safety.' },
      { label: 'Active guardrail policy', requirement: 'attached', value: hasPolicy ? 'yes' : 'none', status: pf(hasPolicy), blocking: true },
    );
  }

  const verdict: GraduationVerdict = !targetLevel ? 'ready' : verdictFrom(criteria);

  // Readiness score (0-100) for ranking — informational, never overrides verdict.
  const passCount = criteria.filter(c => c.status === 'pass').length;
  const readiness = criteria.length ? Math.round((passCount / criteria.length) * 100) : 100;

  const targetName = targetLevel ? AGENT_SCOPE_META[targetLevel].name : 'Full Agency';
  const summary = !targetLevel
    ? 'At maximum autonomy (L4 Full Agency).'
    : verdict === 'ready'
    ? `Earned ${targetName}. ${agreementRate}% agreement over ${daysInScope}d, ${openIncidents} open incidents.`
    : verdict === 'conditional'
    ? `Eligible for ${targetName} with monitoring — some soft criteria not yet met.`
    : `Not yet ready for ${targetName} — ${criteria.filter(c => c.blocking && c.status === 'fail').length} blocking criteria unmet.`;

  return {
    agentId: `agt-${String(i).padStart(5, '0')}`,
    name: `${bu.split(' ')[0]}-Agent-${i}`,
    businessUnit: bu,
    currentLevel, targetLevel, verdict, readiness, criteria, summary,
    decisionsInScope, daysInScope, incidentRate, openIncidents, errorRate,
    guardrailInterventionRate, agreementRate, agreementTrend, hasPolicy,
    reviewerHoursPerMonth,
    stepDown,
    reclaimable: verdict === 'ready' && !stepDown.triggered,
  };
}

/** A deterministic set of agents for the graduation board. */
export function generateGraduations(count: number): AgentGraduation[] {
  return Array.from({ length: count }, (_, i) => buildAgent(i));
}

export interface GraduationSummary {
  total: number;
  ready: number;
  conditional: number;
  notReady: number;
  stepDownRecommended: number;
  reclaimableHoursPerMonth: number;
  pctAtLowAutonomy: number; // L1-L2
  // Human-agreement as a Responsible-AI ALIGNMENT signal (fleet-level roll-up).
  alignment: AlignmentSummary;
}

/**
 * Fleet human-agreement viewed as a Responsible-AI ALIGNMENT metric — how often a
 * human ratifies what the agent proposed. It is a two-edged signal, not "higher is
 * better": very high + rising agreement means the agent is aligned with human
 * judgement (and the HITL step may be rubber-stamping), while falling agreement is
 * an early misalignment/drift warning. Distinct from accuracy: it measures
 * agreement with the human reviewer, not ground truth.
 */
export interface AlignmentSummary {
  meanAgreement: number;        // mean human-agreement rate across the fleet, %
  rising: number;               // agents with agreement trending up
  flat: number;
  falling: number;              // agents trending down — misalignment watch
  wellAligned: number;          // ≥ HIGH_ALIGNMENT and not falling
  misalignmentWatch: number;    // falling trend — needs attention
  rubberStampWatch: number;     // very high + not falling: oversight may add latency not safety
}

// Fleet-alignment bands (agreement %, as a Responsible-AI signal).
export const HIGH_ALIGNMENT = 90;     // at/above: strong human-agent alignment
export const RUBBER_STAMP = 97;       // at/above (and not falling): review may be a rubber stamp

export function summarizeGraduations(agents: AgentGraduation[]): GraduationSummary {
  let ready = 0, conditional = 0, notReady = 0, stepDown = 0, hours = 0, lowAutonomy = 0;
  let agreementSum = 0, rising = 0, flat = 0, falling = 0, wellAligned = 0, misalignmentWatch = 0, rubberStampWatch = 0;
  for (const a of agents) {
    if (a.stepDown.triggered) stepDown++;
    if (a.verdict === 'ready') ready++;
    else if (a.verdict === 'conditional') conditional++;
    else notReady++;
    if (a.reclaimable) hours += a.reviewerHoursPerMonth;
    if (a.currentLevel <= 2) lowAutonomy++;

    agreementSum += a.agreementRate;
    if (a.agreementTrend === 'rising') rising++;
    else if (a.agreementTrend === 'flat') flat++;
    else falling++;
    if (a.agreementTrend === 'falling') misalignmentWatch++;
    else if (a.agreementRate >= RUBBER_STAMP) rubberStampWatch++;
    else if (a.agreementRate >= HIGH_ALIGNMENT) wellAligned++;
  }
  const total = agents.length;
  return {
    total,
    ready, conditional, notReady,
    stepDownRecommended: stepDown,
    reclaimableHoursPerMonth: hours,
    pctAtLowAutonomy: total ? Math.round((lowAutonomy / total) * 100) : 0,
    alignment: {
      meanAgreement: total ? Math.round(agreementSum / total) : 0,
      rising, flat, falling,
      wellAligned, misalignmentWatch, rubberStampWatch,
    },
  };
}
