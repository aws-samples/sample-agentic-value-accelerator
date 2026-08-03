/**
 * handoffData — Agent→human handoff / escalation model for the interactive
 * Action Queue in Human Oversight.
 *
 * When an agent hits its authority/confidence limit it hands the decision to a
 * human "with full context, including what it attempted, why it's uncertain, and
 * what options it recommends" (AWS agentic-governance framework, Scope 3). Each
 * handoff carries:
 *   - a READINESS check (did the agent do its homework: evidence cited, grounding
 *     passed, confidence stated, alternatives considered, policy identified) so an
 *     under-researched decision is flagged before it reaches the human;
 *   - a WORK TRACE (the steps/tool-calls that led here — "show its work");
 *   - the right INTERACTION TYPE (approval / choice / correction / clarification /
 *     review) — not always a generic approve/deny.
 * Maps to Bedrock RETURN_CONTROL / user-confirmation and Step Functions
 * waitForTaskToken (pause→handoff→resume).
 *
 * Anti-pattern guarded (OWASP Agentic T10 "Overwhelming HITL"): only high-impact
 * / low-confidence items reach a human; low-risk work is auto-resolved.
 *
 * Self-contained; deterministic synthetic data (seeded noise, no Math.random /
 * Date.now). Interaction-type taxonomy grounded in Feng, McDonald & Zhang,
 * "Levels of Autonomy for AI Agents" (arXiv:2506.12469) — NOT Anthropic.
 */
import { type AgentScopeLevel } from './autonomyLadder';

export type HandoffStatus = 'pending' | 'awaiting-agent' | 'resolved';
export type HandoffDecision =
  | 'approve' | 'approve-with-edit' | 'reject' | 'take-over' | 'escalate'
  | 'choose' | 'acknowledge' | 'answer';
export type HandoffPriority = 'critical' | 'high' | 'medium';
export type TimeoutAction = 'deny' | 'escalate' | 'auto-approve';

/**
 * The KIND of interaction the agent presents — chosen to fit the situation, not
 * always approve/deny. Each maps to a human role (Feng/McDonald/Zhang 2506.12469).
 */
export type InteractionType =
  | 'approval'       // go/no-go on a proposed action (+ optional edit)  — Approver
  | 'choice'         // pick one of N options the agent surfaced          — Consultant
  | 'correction'     // edit / validate the agent's draft output          — Collaborator
  | 'clarification'  // the agent ASKS the human a question to proceed     — Collaborator
  | 'review';        // read a finding and acknowledge                     — Observer/Approver

export const INTERACTION_META: Record<InteractionType, { label: string; verb: string; role: string }> = {
  approval:      { label: 'Approval',      verb: 'Decide go / no-go',      role: 'Approver' },
  choice:        { label: 'Choice',        verb: 'Pick an option',         role: 'Consultant' },
  correction:    { label: 'Correction',    verb: 'Edit & validate',        role: 'Collaborator' },
  clarification: { label: 'Clarification', verb: 'Answer the agent',       role: 'Collaborator' },
  review:        { label: 'Review',        verb: 'Read & acknowledge',     role: 'Observer' },
};

/** Why this item was escalated to a human (the trigger). */
export type EscalationTrigger =
  | 'exceeds-authority' | 'low-confidence' | 'irreversible-action'
  | 'guardrail-near-miss' | 'novel-situation' | 'high-value';

/** One step in the agent's proof-of-work trace ("show its work"). */
export interface WorkStep {
  label: string;
  detail: string;
  status: 'ok' | 'flag';
}

/** One readiness check — the agent's "definition of ready" for a handoff. */
export interface ReadinessCheck {
  label: string;
  met: boolean;
  blocking: boolean;
  detail: string;
}

/** One turn in the clarifying-question back-and-forth. */
export interface HandoffMessage {
  from: 'human' | 'agent';
  text: string;
  minsAgo: number;
}

export interface HandoffItem {
  id: string;
  agentId: string;
  agentName: string;
  businessUnit: string;
  currentLevel: AgentScopeLevel;
  priority: HandoffPriority;
  status: HandoffStatus;
  interactionType: InteractionType;
  /** The decision needed, stated as an imperative (not the agent name). */
  decisionNeeded: string;
  trigger: EscalationTrigger;
  whyEscalated: string;
  riskScore: number;          // 0-100
  confidence: number;         // 0-1, advisory only
  // ── The 3-item handoff context payload (AWS Scope-3 principle) ──
  attempted: string;
  uncertainty: string;
  recommendedOptions: { label: string; recommended: boolean; rationale: string }[];
  // ── Proof-of-work: how the agent got to the point it needs help ──
  workTrace: WorkStep[];
  // ── Readiness: did the agent do its homework before handing off ──
  readiness: { checks: ReadinessCheck[]; score: number; ready: boolean };
  // ── Interaction-specific payloads ──
  question?: string;          // for 'clarification' — the agent's question to the human
  suggestedAnswers?: string[];// quick replies for a clarification
  draft?: string;             // for 'correction' — the agent's editable draft
  finding?: string;           // for 'review' — the report the human acknowledges
  // ── Supporting context ──
  evidence: string[];
  policyRef: string;
  conversation: HandoffMessage[];
  // ── SLA ──
  slaMinutesTotal: number;
  minsElapsed: number;
  timeoutAction: TimeoutAction;
  nextEscalation: string;
  // ── Feedback-loop tie-in (agreement signal; autonomy stays human-granted) ──
  agreementRate: number;
  agreementTrend: 'rising' | 'flat' | 'falling';
  /** What this agent has LEARNED about how this human likes to work (emerging pattern, not AWS doctrine). */
  learnedPreference?: string;
  // ── Resolution (if resolved) ──
  decision?: HandoffDecision;
  decidedBy?: string;
  decisionReason?: string;
}

// Deterministic [0,1) pseudo-noise.
function noise(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const BUSINESS_UNITS = ['Retail Banking', 'Capital Markets', 'Wealth Management', 'Risk & Fraud', 'Operations', 'Customer Service', 'Compliance', 'Insurance'];

const TRIGGER_META: Record<EscalationTrigger, { why: string; priority: HandoffPriority; timeout: TimeoutAction }> = {
  'exceeds-authority':   { why: 'Action value exceeds the agent\'s approved authority limit', priority: 'high',     timeout: 'deny' },
  'low-confidence':      { why: 'Agent confidence below the 0.70 routing threshold',          priority: 'medium',   timeout: 'escalate' },
  'irreversible-action': { why: 'Irreversible action — requires explicit human confirmation',  priority: 'critical', timeout: 'deny' },
  'guardrail-near-miss': { why: 'Guardrail score within 0.05 of the block threshold',          priority: 'high',     timeout: 'deny' },
  'novel-situation':     { why: 'No matching precedent in the agent\'s decision history',       priority: 'medium',   timeout: 'escalate' },
  'high-value':          { why: 'High-value transaction over the four-eyes review threshold',   priority: 'critical', timeout: 'escalate' },
};

const TRIGGERS = Object.keys(TRIGGER_META) as EscalationTrigger[];

interface Scenario {
  decision: string;
  interactionType: InteractionType;
  attempted: string;
  uncertainty: string;
  options: { label: string; recommended: boolean; rationale: string }[];
  evidence: string[];
  policy: string;
  workTrace: WorkStep[];
  question?: string;
  suggestedAnswers?: string[];
  draft?: string;
  finding?: string;
  learned?: string;
}

const SCENARIOS: Record<EscalationTrigger, Scenario> = {
  'high-value': {
    decision: 'Approve wire transfer of $1.25M to Vendor Acct ···4421',
    interactionType: 'approval',
    attempted: 'Matched invoice INV-3392 to PO-1180; vendor on the approved list; amount within the master services agreement ceiling. Prepared the transfer but withheld execution.',
    uncertainty: 'Amount is 4.1× this vendor\'s 90-day average payment; no second invoice found to corroborate the unusually large total.',
    options: [
      { label: 'Approve the full $1.25M transfer', recommended: false, rationale: 'Clears the invoice but commits a large outlier without corroboration.' },
      { label: 'Approve, hold for treasury second-sign', recommended: true, rationale: 'Releases on a four-eyes confirmation — matches policy for >$1M outliers.' },
      { label: 'Reject pending vendor callback', recommended: false, rationale: 'Safest, but delays a legitimate-looking payment.' },
    ],
    evidence: ['Invoice INV-3392.pdf', 'PO-1180', 'Vendor 90-day payment history', 'Approved-vendor list v14'],
    policy: 'Treasury Payments Policy §4.2 — transfers >$1M require four-eyes confirmation',
    workTrace: [
      { label: 'Retrieved invoice', detail: 'Pulled INV-3392 from AP inbox; parsed amount, vendor, line items', status: 'ok' },
      { label: 'Matched PO', detail: '3-way match INV-3392 ↔ PO-1180 ↔ receipt — all line items reconciled', status: 'ok' },
      { label: 'Verified vendor', detail: 'Vendor present on approved-vendor list v14; bank account on file matches', status: 'ok' },
      { label: 'Checked payment history', detail: '90-day avg $305k; this payment is 4.1× the average', status: 'flag' },
      { label: 'Searched for second invoice', detail: 'No corroborating invoice found for the larger total', status: 'flag' },
    ],
    learned: 'You\'ve consistently required a second-sign on >$1M outliers — the agent now pre-stages the four-eyes hold.',
  },
  'irreversible-action': {
    decision: 'Confirm permanent closure of dormant account ···8830',
    interactionType: 'approval',
    attempted: 'Verified 18 months of zero activity and a customer-initiated closure request; staged the account for permanent closure and data-retention archival.',
    uncertainty: 'A pending ACH credit ($340) arrived 2 days ago — closure may bounce an incoming payment.',
    options: [
      { label: 'Close now', recommended: false, rationale: 'Honors the request but may reject the inbound ACH.' },
      { label: 'Hold 5 business days, then close', recommended: true, rationale: 'Lets the pending credit settle before an irreversible close.' },
      { label: 'Contact customer first', recommended: false, rationale: 'Most cautious; adds handling time.' },
    ],
    evidence: ['Closure request 2026-06-21', 'Activity log (18mo)', 'Pending ACH credit $340'],
    policy: 'Account Lifecycle Policy §7 — irreversible actions require human confirmation',
    workTrace: [
      { label: 'Validated request', detail: 'Closure request signed by accountholder on 2026-06-21', status: 'ok' },
      { label: 'Checked activity', detail: '18 months zero transactional activity confirmed', status: 'ok' },
      { label: 'Scanned pending items', detail: 'Found a $340 ACH credit posted 2 days ago — not yet settled', status: 'flag' },
    ],
  },
  'exceeds-authority': {
    decision: 'Grant a rate exception on loan app LN-77213',
    interactionType: 'choice',
    attempted: 'Computed an eligible discount of 50 bps from the pricing engine; the customer\'s retention offer needs 75 bps, which exceeds the agent\'s 50 bps authority.',
    uncertainty: 'The extra 25 bps is outside the agent\'s delegated pricing authority and needs a human with lending authority to choose the level.',
    options: [
      { label: 'Grant 75 bps (full retention offer)', recommended: true, rationale: 'Retention value exceeds the margin cost per the LTV model.' },
      { label: 'Grant 60 bps (partial)', recommended: false, rationale: 'Splits the difference; may not retain the customer.' },
      { label: 'Cap at the 50 bps auto-limit', recommended: false, rationale: 'Stays in policy but likely loses the customer.' },
    ],
    evidence: ['Pricing engine output', 'Customer LTV model', 'Retention offer terms'],
    policy: 'Lending Authority Matrix — exceptions >50 bps require a human approver',
    workTrace: [
      { label: 'Priced the loan', detail: 'Pricing engine returned a 50 bps eligible discount', status: 'ok' },
      { label: 'Modeled retention value', detail: 'LTV model: retaining this customer is worth ~3.2× the margin cost of 75 bps', status: 'ok' },
      { label: 'Checked authority', detail: 'Required 75 bps exceeds the agent\'s 50 bps delegated limit', status: 'flag' },
    ],
    learned: 'You usually grant the full retention offer when LTV > 2× margin cost — the agent now leads with that option.',
  },
  'guardrail-near-miss': {
    decision: 'Release drafted customer email (toxicity 0.76 vs 0.80 block)',
    interactionType: 'correction',
    attempted: 'Drafted a complaint-resolution reply; the content guardrail scored it 0.76 toxicity — just under the 0.80 block — flagging firm language about fees.',
    uncertainty: 'Tone is borderline; the draft may read as dismissive to an already-upset customer.',
    options: [
      { label: 'Send as drafted', recommended: false, rationale: 'Fast, but risks escalating the complaint.' },
      { label: 'Soften tone, then send', recommended: true, rationale: 'Keeps the resolution while reducing complaint-escalation risk.' },
    ],
    evidence: ['Drafted reply', 'Guardrail score breakdown', 'Complaint thread CS-9921'],
    policy: 'Customer Comms Standard §3 — borderline guardrail scores route to a human',
    draft: 'Thank you for contacting us. The $35 fee on your account is valid and was correctly applied per your account terms. We will not be reversing it. If you have further questions, review your agreement.',
    workTrace: [
      { label: 'Read complaint', detail: 'Parsed thread CS-9921 — customer disputing a $35 fee, escalating tone', status: 'ok' },
      { label: 'Drafted reply', detail: 'Generated a resolution explaining the fee basis', status: 'ok' },
      { label: 'Ran content guardrail', detail: 'Toxicity 0.76 (block at 0.80) — flagged "firm/dismissive" tone', status: 'flag' },
    ],
    learned: 'You almost always soften fee-dispute replies before sending — the agent now drafts a warmer first pass.',
  },
  'novel-situation': {
    decision: 'Decide handling for an unrecognized sanctions-list near-match',
    interactionType: 'choice',
    attempted: 'Screened a new counterparty; got a 0.82 fuzzy name match against an OFAC entry with no exact identifier match and no precedent in decision history.',
    uncertainty: 'Name similarity is high but identifiers (DOB, address) don\'t match — could be a false positive or an alias.',
    options: [
      { label: 'Escalate to the sanctions desk', recommended: true, rationale: 'Novel high-stakes screening belongs with a specialist.' },
      { label: 'Clear as false positive', recommended: false, rationale: 'Identifiers differ, but a 0.82 match is high for an OFAC name.' },
      { label: 'Request enhanced due diligence', recommended: false, rationale: 'Gather more identifiers before deciding.' },
    ],
    evidence: ['OFAC fuzzy-match report', 'Counterparty KYC packet', 'Screening config'],
    policy: 'Sanctions Screening SOP — unresolved near-matches escalate to the sanctions desk',
    workTrace: [
      { label: 'Screened counterparty', detail: 'Ran the new counterparty against OFAC + internal watchlists', status: 'ok' },
      { label: 'Scored the match', detail: '0.82 fuzzy name match; DOB and address do NOT match the OFAC record', status: 'flag' },
      { label: 'Searched precedent', detail: 'No similar prior disposition found in 24 months of history', status: 'flag' },
    ],
  },
  'low-confidence': {
    decision: 'Confirm fraud disposition on transaction TXN-55120',
    interactionType: 'clarification',
    attempted: 'Scored a card transaction as likely-legitimate (0.61) based on location and merchant history; the device fingerprint is new, lowering confidence.',
    uncertainty: 'Confidence 0.61 is below the 0.70 auto-clear threshold; signals are mixed (familiar merchant, unfamiliar device).',
    options: [
      { label: 'Clear the transaction', recommended: true, rationale: 'Merchant + amount fit the customer\'s pattern; device change alone is weak.' },
      { label: 'Hold and step-up verify', recommended: false, rationale: 'Adds friction for a likely-legitimate purchase.' },
    ],
    evidence: ['Transaction TXN-55120', 'Device fingerprint history', 'Customer spend pattern'],
    policy: 'Fraud Ops Playbook §2 — sub-0.70 confidence dispositions need human review',
    question: 'Has this customer recently told us about a new device or phone? That would explain the unfamiliar fingerprint and let me clear this automatically.',
    suggestedAnswers: ['Yes — new device on file, clear it', 'No record — hold and step-up verify', 'Check with the customer first'],
    workTrace: [
      { label: 'Scored the transaction', detail: 'Fraud model: 0.61 likely-legitimate (location + merchant history positive)', status: 'ok' },
      { label: 'Checked device', detail: 'Device fingerprint is new — not seen on this account before', status: 'flag' },
      { label: 'Compared to pattern', detail: 'Merchant and amount fit the customer\'s normal spend', status: 'ok' },
    ],
    learned: 'When you\'ve flagged "new device" as benign before, the agent now checks the device-change log first.',
  },
};

/** Build the readiness checklist for a handoff (the agent's "definition of ready"). */
function buildReadiness(sc: Scenario, i: number): HandoffItem['readiness'] {
  const grounded = noise(i * 23 + 9) > 0.18;          // occasionally fails grounding → "not ready"
  const hasAlternatives = sc.options.length >= 2;
  const checks: ReadinessCheck[] = [
    { label: 'Question framed', met: true, blocking: false, detail: 'The specific decision is stated.' },
    { label: 'Evidence gathered & cited', met: sc.evidence.length > 0, blocking: true, detail: `${sc.evidence.length} sources attached.` },
    { label: 'Grounding check passed', met: grounded, blocking: true, detail: grounded ? 'Claims grounded in retrieved sources (≥0.70).' : 'Grounding score below threshold — possible unsupported claim.' },
    { label: 'Reasoning captured', met: sc.workTrace.length > 0, blocking: true, detail: `${sc.workTrace.length}-step work trace recorded.` },
    { label: 'Confidence stated', met: true, blocking: false, detail: 'Confidence + why-uncertain provided.' },
    { label: 'Alternatives considered', met: hasAlternatives, blocking: true, detail: `${sc.options.length} options surfaced.` },
    { label: 'Policy identified', met: !!sc.policy, blocking: true, detail: sc.policy },
  ];
  const score = Math.round((checks.filter(c => c.met).length / checks.length) * 100);
  const ready = !checks.some(c => c.blocking && !c.met);
  return { checks, score, ready };
}

function buildItem(i: number): HandoffItem {
  const trigger = TRIGGERS[i % TRIGGERS.length];
  const meta = TRIGGER_META[trigger];
  const sc = SCENARIOS[trigger];
  const bu = BUSINESS_UNITS[i % BUSINESS_UNITS.length];
  const level = (noise(i * 3 + 1) < 0.6 ? 2 : 3) as AgentScopeLevel;

  const riskScore = Math.round(45 + noise(i * 5 + 2) * 50);
  const confidence = +(0.5 + noise(i * 7 + 3) * 0.35).toFixed(2);
  const slaMinutesTotal = [30, 60, 120][i % 3];
  const minsElapsed = Math.round(noise(i * 11 + 4) * slaMinutesTotal);
  const agreementRate = Math.round(82 + noise(i * 13 + 5) * 16);
  const tr = noise(i * 17 + 6);
  const agreementTrend = tr < 0.25 ? 'falling' : tr < 0.6 ? 'flat' : 'rising';

  const awaiting = noise(i * 19 + 7) > 0.82;
  const conversation: HandoffMessage[] = awaiting
    ? [{ from: 'human', text: 'Was the duplicate-invoice check run against the last 90 days specifically?', minsAgo: 6 }]
    : [];

  // Agent id aligned with graduationData (agt-000NN, no offset) so the handoff
  // links to the same agent's earned-autonomy record.
  const idNum = (i % 80) + 1;

  return {
    id: `ho-${String(i).padStart(4, '0')}`,
    agentId: `agt-${String(idNum).padStart(5, '0')}`,
    agentName: `${bu.split(' ')[0]}-Agent-${idNum}`,
    businessUnit: bu,
    currentLevel: level,
    priority: meta.priority,
    status: awaiting ? 'awaiting-agent' : 'pending',
    interactionType: sc.interactionType,
    decisionNeeded: sc.decision,
    trigger,
    whyEscalated: meta.why,
    riskScore,
    confidence,
    attempted: sc.attempted,
    uncertainty: sc.uncertainty,
    recommendedOptions: sc.options,
    workTrace: sc.workTrace,
    readiness: buildReadiness(sc, i),
    question: sc.question,
    suggestedAnswers: sc.suggestedAnswers,
    draft: sc.draft,
    finding: sc.finding,
    evidence: sc.evidence,
    policyRef: sc.policy,
    conversation,
    slaMinutesTotal,
    minsElapsed,
    timeoutAction: meta.timeout,
    nextEscalation: meta.timeout === 'escalate' ? 'Team Lead → Senior Reviewer' : 'Held (treated as denied) until approved',
    agreementRate,
    agreementTrend,
    learnedPreference: sc.learned,
  };
}

/** A deterministic set of pending handoffs for the Action Queue. */
export function generateHandoffs(count: number): HandoffItem[] {
  return Array.from({ length: count }, (_, i) => buildItem(i));
}

export interface HandoffSummary {
  pending: number;
  critical: number;
  awaitingAgent: number;
  dueSoon: number;
  /** Handoffs flagged not-ready (failed a blocking readiness check). */
  notReady: number;
  autoResolvedToday: number;
  routedToHuman: number;
}

export function summarizeHandoffs(items: HandoffItem[]): HandoffSummary {
  let critical = 0, awaiting = 0, dueSoon = 0, notReady = 0;
  for (const it of items) {
    if (it.priority === 'critical') critical++;
    if (it.status === 'awaiting-agent') awaiting++;
    if (!it.readiness.ready) notReady++;
    const left = it.slaMinutesTotal - it.minsElapsed;
    if (left / it.slaMinutesTotal < 0.25) dueSoon++;
  }
  const routedToHuman = items.length;
  const autoResolvedToday = Math.round(routedToHuman * 68 + 419);
  return {
    pending: items.filter(i => i.status !== 'resolved').length,
    critical, awaitingAgent: awaiting, dueSoon, notReady,
    autoResolvedToday, routedToHuman,
  };
}

/** Minutes remaining on the SLA (can be negative = breached). */
export function slaMinutesLeft(it: HandoffItem): number {
  return it.slaMinutesTotal - it.minsElapsed;
}

/**
 * A deterministic 8-point agreement-rate history ending at the agent's current
 * rate, sloped by its trend — for the per-agent sparkline that links the handoff
 * panel to the agent's earned-autonomy track record.
 */
export function agreementHistory(it: HandoffItem): number[] {
  const end = it.agreementRate;
  const slope = it.agreementTrend === 'rising' ? 1 : it.agreementTrend === 'falling' ? -1 : 0;
  const span = 9; // total drift across the window
  return Array.from({ length: 8 }, (_, k) => {
    const t = (k - 7) / 7; // -1 .. 0
    const base = end + slope * span * t;          // linear trend to `end`
    const wobble = (noise(it.agreementRate * 7 + k * 13) - 0.5) * 3; // small deterministic jitter
    return Math.round(Math.max(60, Math.min(100, base + wobble)));
  });
}

/** Fixed reason taxonomy for reject/edit decisions (feeds audit + agreement signal). */
export const REJECT_REASONS = [
  'Insufficient evidence',
  'Exceeds risk appetite',
  'Policy violation',
  'Needs vendor/customer confirmation',
  'Incorrect agent reasoning',
  'Requires specialist review',
] as const;
