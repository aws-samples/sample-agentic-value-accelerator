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

/**
 * `insufficient_evidence` is distinct from `not_ready`. An agent nobody has
 * evidence about is not a mild form of qualifying, and it is not a judgement that
 * the agent fell short — it is an absence. Folding it into `conditional` rendered
 * "eligible with monitoring" for an agent with three logged decisions.
 */
export type GraduationVerdict = 'ready' | 'conditional' | 'not_ready' | 'insufficient_evidence';

/** `insufficient` means UNKNOWN — excluded from the readiness score, never scored as a failure. */
export type CriterionStatus = 'pass' | 'warning' | 'fail' | 'insufficient';

// ── Readiness scoring ────────────────────────────────────────────────────────
//
// Mirrors backend/src/models/govern_graduation.py. That file is the authority;
// this exists so the demo roster scores identically to the live one. Keep the
// weights, MIN_CRITERION_COVERAGE and PROMOTION_MARGIN in step with it.
//
// There is deliberately NO second tier scale here (no T1–T4 "trust tier"). Agents
// sit on one ladder, L1–L4. A parallel four-point scale over the same question
// would be ambiguous to a reader — not least because "Supervised" names L3, the
// second-HIGHEST level on this ladder. The delegation-chain minimum that a trust
// scale would have provided already exists as the A2A autonomy ceiling,
// min(source.scopeLevel, target.scopeLevel, policy.maxDelegatedAutonomy).

export const CRITERION_WEIGHTS: Record<string, number> = {
  // Blocking safety gates — highest consequence.
  'Open incidents': 0.20,
  'Active guardrail policy': 0.20,
  // Blocking, and the signal the whole model is built on.
  'Human agreement rate': 0.18,
  // Blocking, but they measure evidence VOLUME rather than behaviour quality.
  'Decisions in current scope': 0.12,
  'Time at current level': 0.10,
  // Advisory: a breach warrants attention, not a held promotion.
  'Incident rate': 0.08,
  'Guardrail intervention rate': 0.07,
  'Error rate': 0.05,
};

/** Share of criterion weight that must be KNOWN before a readiness number is emitted. */
export const MIN_CRITERION_COVERAGE = 0.60;

/**
 * Margin a numeric criterion must clear to EARN a step up (bare threshold to hold it).
 *
 * Two of them, because one relative margin is wrong for bounded scales.
 * PROMOTION_MARGIN is relative, for unbounded quantities (decision counts, days,
 * rate ceilings). PROMOTION_MARGIN_POINTS is absolute, for percentages bounded at
 * 100: applying the relative margin to `minAgreement` gave effective bars of 99%
 * for L3 and 104.5% for L4, the second of which is unreachable, so no agent could
 * ever be promoted to L4. Capped at 100 so a high threshold cannot become
 * impossible.
 */
export const PROMOTION_MARGIN = 0.10;
export const PROMOTION_MARGIN_POINTS = 2.0;

/**
 * Minimum real decisions before readiness is judged at all. Mirrors
 * MIN_DECISIONS_FOR_EVIDENCE in services/govern_graduation_service.py.
 */
export const MIN_DECISIONS_FOR_EVIDENCE = 8;

/** What a score means and what it is made of — rendered wherever the score is. */
export interface ScoreProvenance {
  metric: string;
  definition: string;
  polarity: 'higher_is_better' | 'lower_is_better';
  method: string;
  inputs: string[];
  scoredWeightPct: number;
  knownCriteria: number;
  totalCriteria: number;
  unknownCriteria: string[];
  minCoveragePct: number;
  unscoredReason?: string;
  /** False for the demo roster — the badge and the score must not disagree. */
  live: boolean;
}

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
  /** Share of the readiness score this criterion carries. */
  weight: number;
  /** True when the criterion could not be evaluated — excluded from the score. */
  unknown: boolean;
}

export interface AgentGraduation {
  agentId: string;
  name: string;
  businessUnit: string;
  currentLevel: AgentScopeLevel;
  targetLevel: AgentScopeLevel | null;   // null if already at L4
  verdict: GraduationVerdict;
  /** null = NOT SCORED. Never render as 0, which reads as "assessed and failed". */
  readiness: number | null;
  criteria: GraduationCriterion[];
  summary: string;
  /** Always populated, including when readiness is null. */
  scoreProvenance: ScoreProvenance;
  /** Labels of blocking criteria currently failing — what the user must act on. */
  blockingFailures: string[];
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
  if (criteria.some(c => c.blocking && c.status === 'insufficient')) return 'insufficient_evidence';
  // An UNKNOWN advisory criterion does not degrade the verdict: advisory criteria
  // do not gate a promotion, and one of them (Error rate) has no live feed at all,
  // so treating its absence as a shortfall would pin every agent at `conditional`
  // with nothing an operator could do to clear it. A BREACHED advisory criterion
  // (`warning`) still degrades — that is a real measured shortfall.
  if (criteria.some(c => c.status !== 'pass' && c.status !== 'insufficient')) return 'conditional';
  return 'ready';
}

const READINESS_INPUTS = [
  'Human decisions recorded in the Govern audit log (approve / reject / escalate / take-over)',
  'Bedrock Guardrails intervention counts for the guardrail bound to this agent',
  'Incidents reported against this agent, and their open/closed state',
  "Elapsed time at the agent's current scope level",
  'Whether a guardrail policy is currently attached',
];

const READINESS_DEFINITION =
  'How much of the evidence required to reduce human oversight for this agent is ' +
  'currently satisfied. It is a measure of EVIDENCE, not of the agent’s quality, ' +
  'and it never promotes anything on its own — a human grants every step up the ' +
  'L1–L4 ladder.';

const READINESS_METHOD =
  'Weighted share of the graduation criteria that pass, counting an advisory breach ' +
  'as half. Criteria are weighted by consequence, so the blocking safety gates move ' +
  'the number more than the advisory rates. Criteria that cannot be evaluated are ' +
  'excluded from the calculation rather than counted as failures, and the share of ' +
  'weight actually evaluated is reported alongside the score.';

/**
 * Weighted readiness over KNOWN criteria only, plus the provenance to render it.
 * Mirrors `score_readiness` in models/govern_graduation.py.
 *
 * A `warning` scores as a half pass rather than zero: it is a real shortfall, but
 * zeroing it would make an advisory criterion behave like a blocking one, which is
 * the distinction the `blocking` flag exists to draw.
 */
export function scoreReadiness(
  criteria: GraduationCriterion[],
  live: boolean,
): { readiness: number | null; provenance: ScoreProvenance } {
  const known = criteria.filter(c => !c.unknown);
  const unknownCriteria = criteria.filter(c => c.unknown).map(c => c.label);
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
  const knownWeight = known.reduce((s, c) => s + c.weight, 0);
  const coverage = totalWeight > 0 ? knownWeight / totalWeight : 0;
  const scoredWeightPct = Math.round(coverage * 100);

  const provenance = (pct: number, knownCount: number, unscoredReason?: string): ScoreProvenance => ({
    metric: 'Readiness',
    definition: READINESS_DEFINITION,
    polarity: 'higher_is_better',
    method: READINESS_METHOD,
    inputs: READINESS_INPUTS,
    scoredWeightPct: pct,
    knownCriteria: knownCount,
    totalCriteria: criteria.length,
    unknownCriteria,
    minCoveragePct: Math.round(MIN_CRITERION_COVERAGE * 100),
    unscoredReason,
    live,
  });

  if (criteria.length === 0) {
    return {
      readiness: null,
      provenance: provenance(0, 0, 'This agent is already at L4 Full Agency, so there is no further step to earn.'),
    };
  }
  if (knownWeight <= 0) {
    return {
      readiness: null,
      provenance: provenance(0, 0, 'None of the graduation criteria could be evaluated for this agent yet.'),
    };
  }

  // A blocking gate that is UNKNOWN cannot be scored past — a number here would
  // imply the gate had been checked and cleared.
  const unknownBlocking = criteria.filter(c => c.unknown && c.blocking).map(c => c.label);
  if (unknownBlocking.length > 0) {
    return {
      readiness: null,
      provenance: provenance(
        scoredWeightPct, known.length,
        `Not scored: ${unknownBlocking.join(', ')} must be evaluated before readiness means anything, and there is not enough evidence for it yet.`,
      ),
    };
  }
  if (coverage < MIN_CRITERION_COVERAGE) {
    return {
      readiness: null,
      provenance: provenance(
        scoredWeightPct, known.length,
        `Not scored: only ${scoredWeightPct}% of the criteria weight could be evaluated, below the ${Math.round(
          MIN_CRITERION_COVERAGE * 100,
        )}% minimum for a readiness number to be meaningful.`,
      ),
    };
  }

  const credit = known.reduce(
    (s, c) => s + (c.status === 'pass' ? c.weight : c.status === 'warning' ? c.weight * 0.5 : 0),
    0,
  );
  return {
    readiness: Math.round((credit / knownWeight) * 100),
    provenance: provenance(scoredWeightPct, known.length),
  };
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

  // Roughly one agent in eight is barely instrumented. Included deliberately: the
  // previous roster gave every agent 200+ decisions, so the "insufficient evidence"
  // state — the one a real fleet hits constantly on a freshly onboarded agent —
  // never appeared in the demo at all.
  const thin = noise(i * 17 + 13) < 0.125;
  const decisionsInScope = thin
    ? Math.round(noise(i * 3 + 2) * (MIN_DECISIONS_FOR_EVIDENCE - 1))
    : Math.round(200 + noise(i * 3 + 2) * 9000);
  const daysInScope = Math.round(5 + noise(i * 3 + 3) * 160);
  // Has a human already granted this agent its current level? Drives hysteresis:
  // holding a level needs the bare threshold, earning one needs the margin.
  const alreadyGranted = noise(i * 19 + 14) > 0.45;
  // No per-agent error feed exists anywhere in the platform yet, live or demo.
  const errorRateMeasured = false;
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
    // Hysteresis: an agent that has NOT been granted this step must clear each
    // numeric threshold by PROMOTION_MARGIN to earn it; one already holding the
    // level keeps it at the bare threshold. Without the margin an agent sitting
    // exactly on a threshold flips verdict between renders.
    const holding = alreadyGranted;
    const margin = holding ? 0 : PROMOTION_MARGIN;
    // Epsilon: the effective bars are products of floats — 90 * 1.1 is
    // 99.00000000000001 — so an agent measured at exactly 99 would be failed
    // against a bar it visibly meets.
    const EPS = 1e-9;
    const fmt = (v: number, integer: boolean) => (integer ? String(Math.round(v)) : String(+v.toFixed(2)));

    /**
     * Lower bound. The requirement string states the bar AS TESTED: showing
     * "≥ 90%" while testing against 99% would mark an agent measured at 99% as
     * failing a requirement it appears to meet.
     */
    const atLeast = (value: number, threshold: number, unit = '', integer = true, pctBounded = false) => {
      const raw = pctBounded
        ? Math.min(100, threshold + (margin ? PROMOTION_MARGIN_POINTS : 0))
        : threshold * (1 + margin);
      const eff = integer ? Math.ceil(raw - EPS) : raw;
      return {
        ok: value + EPS >= eff,
        requirement: margin === 0
          ? `≥ ${fmt(threshold, integer)}${unit}`
          : `≥ ${fmt(eff, integer)}${unit} to earn (${fmt(threshold, integer)}${unit} to hold)`,
      };
    };
    const atMost = (value: number, threshold: number, unit = '', integer = false) => {
      const eff = threshold * (1 - margin);
      return {
        ok: value <= eff + EPS,
        requirement: margin === 0
          ? `≤ ${fmt(threshold, integer)}${unit}`
          : `≤ ${fmt(eff, integer)}${unit} to earn (${fmt(threshold, integer)}${unit} to hold)`,
      };
    };
    const crit = (
      label: string, requirement: string, value: string, ok: boolean,
      blocking: boolean, detail?: string, unknown = false,
    ): GraduationCriterion => ({
      label, requirement, value,
      status: unknown ? 'insufficient' : ok ? 'pass' : blocking ? 'fail' : 'warning',
      blocking, detail,
      weight: CRITERION_WEIGHTS[label] ?? 0,
      unknown,
    });

    const thinDetail = thin ? 'Rate computed over too few decisions to be meaningful.' : undefined;

    let r = atLeast(decisionsInScope, t.decisions);
    criteria.push(crit('Decisions in current scope', r.requirement, decisionsInScope.toLocaleString(), r.ok, true,
      thin ? 'Not enough decisions logged yet to judge readiness.' : undefined, thin));

    r = atLeast(daysInScope, t.days, 'd');
    criteria.push(crit('Time at current level', r.requirement, `${daysInScope}d`, r.ok, true));

    criteria.push(crit('Open incidents', '0', String(openIncidents), openIncidents === 0, true,
      'An open incident blocks a step up outright.'));

    r = atMost(incidentRate, t.maxIncidentRate, '/1k');
    criteria.push(crit('Incident rate', r.requirement, `${incidentRate}/1k`, r.ok, false, thinDetail, thin));

    // Error rate is UNKNOWN unless a real per-agent error signal exists. Scoring a
    // placeholder against "≤ 2%" would be a clean bill of health on a dimension
    // nothing measures. Listed rather than hidden so the gap is visible.
    r = atMost(errorRate, t.maxErrorRate, '%');
    criteria.push(crit('Error rate', r.requirement, errorRateMeasured ? `${errorRate}%` : 'not measured',
      r.ok, false,
      thin ? thinDetail : errorRateMeasured ? undefined
        : 'No per-agent error signal is wired up yet, so this is reported as unknown rather than scored as a pass.',
      !errorRateMeasured || thin));

    r = atMost(guardrailInterventionRate, t.maxGuardrail, '%');
    criteria.push(crit('Guardrail intervention rate', r.requirement, `${guardrailInterventionRate}%`, r.ok, false, thinDetail, thin));

    r = atLeast(agreementRate, t.minAgreement, '%', true, true);
    const falling = agreementTrend === 'falling';
    criteria.push(crit('Human agreement rate', r.requirement,
      `${agreementRate}% ${agreementTrend === 'rising' ? '▲' : falling ? '▼' : ''}`.trim(),
      r.ok && !falling, true,
      thin ? 'Not enough decisions to compute an agreement rate.'
        : falling ? 'Agreement is trending down, an early misalignment signal — a step up is held regardless of the rate.'
        : r.ok ? 'Reviewers approve nearly everything proposed — oversight adds little marginal safety.'
        : 'Reviewers still overturn enough proposals that the human is adding safety.',
      thin));

    criteria.push(crit('Active guardrail policy', 'attached', hasPolicy ? 'yes' : 'none', hasPolicy, true));
  }

  const verdict: GraduationVerdict = !targetLevel ? 'ready' : verdictFrom(criteria);
  // `live: false` — this roster is illustrative, so the score and the panel badge
  // cannot disagree about where the numbers came from.
  const { readiness, provenance } = scoreReadiness(criteria, false);
  const blockingFailures = criteria.filter(c => c.blocking && c.status === 'fail').map(c => c.label);

  const targetName = targetLevel ? AGENT_SCOPE_META[targetLevel].name : 'Full Agency';
  const summary = !targetLevel
    ? 'At maximum autonomy (L4 Full Agency).'
    : verdict === 'insufficient_evidence'
    ? `Insufficient evidence — ${decisionsInScope.toLocaleString()} decisions logged so far.`
    : verdict === 'ready'
    ? `Earned ${targetName}. ${agreementRate}% agreement over ${daysInScope}d, ${openIncidents} open incidents.`
    : verdict === 'conditional'
    ? `Eligible for ${targetName} with monitoring — some soft criteria not yet met.`
    : `Not yet ready for ${targetName} — blocked by ${blockingFailures.join(', ')}.`;

  return {
    agentId: `agt-${String(i).padStart(5, '0')}`,
    name: `${bu.split(' ')[0]}-Agent-${i}`,
    businessUnit: bu,
    currentLevel, targetLevel, verdict, readiness, criteria, summary,
    scoreProvenance: provenance, blockingFailures,
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
  /** Held because nothing is known yet — NOT the same as judged and found wanting. */
  insufficientEvidence: number;
  /**
   * Agents whose readiness could not be scored at all. Reported so a roll-up cannot
   * imply the whole fleet was assessed: "12 ready of 40" reads very differently
   * when 21 of the 40 were never scoreable.
   */
  unscored: number;
  /** Mean readiness across SCORED agents only — null when none could be scored. */
  meanReadinessScored: number | null;
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
  let ready = 0, conditional = 0, notReady = 0, insufficient = 0, stepDown = 0, hours = 0, lowAutonomy = 0;
  let agreementSum = 0, rising = 0, flat = 0, falling = 0, wellAligned = 0, misalignmentWatch = 0, rubberStampWatch = 0;
  // Readiness of SCORED agents only. Averaging an unscored agent in as 0 would
  // understate the fleet rather than admit the gap.
  let readinessSum = 0, scoredCount = 0;
  for (const a of agents) {
    if (a.stepDown.triggered) stepDown++;
    if (a.verdict === 'ready') ready++;
    else if (a.verdict === 'conditional') conditional++;
    else if (a.verdict === 'insufficient_evidence') insufficient++;
    else notReady++;
    if (a.readiness !== null) { readinessSum += a.readiness; scoredCount++; }
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
    insufficientEvidence: insufficient,
    unscored: total - scoredCount,
    meanReadinessScored: scoredCount ? Math.round(readinessSum / scoredCount) : null,
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
