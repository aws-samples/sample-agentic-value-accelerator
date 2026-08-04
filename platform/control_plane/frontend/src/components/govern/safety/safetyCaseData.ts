/**
 * safetyCaseData — structured safety cases for the AI Safety module.
 *
 * A safety case is a structured claims–arguments–evidence artifact (GSN / CAE
 * style) that assembles the RATIONALE behind a deploy decision. It maps onto the
 * existing Deployment Gate: the gate gives the verdict, the safety case gives the
 * *argument*.
 *
 * Taxonomy: Clymer et al. (2024), "Safety Cases: How to Justify the Safety of
 * Advanced AI Systems." The top claim ("system X is safe to deploy for use Y") is
 * supported by one of four argument types:
 *   - Inability       — the system can't cause the harm (capability too low).
 *   - Control         — the system is prevented from causing harm (guardrails/HITL).
 *   - Trustworthiness — the system won't try to cause harm (aligned behavior).
 *   - Deference       — a trusted overseer vouches for the system.
 * Each argument decomposes into sub-claims, each backed by evidence items (evals,
 * guardrails, HITL, red-team results, audits) with a met/partial/unmet status.
 *
 * Honest framing: we STRUCTURE the argument; we do not auto-judge soundness. The
 * deploy verdict stays expert/qualitative. Coverage % is a completeness signal
 * (share of evidence met), not a safety score.
 *
 * Sources: Clymer, Gabriel, Krueger et al. 2024 (arXiv:2403.10462); GSN Community
 * Standard v3; Adelard CAE (Claims-Arguments-Evidence).
 */

export type ArgumentType = 'inability' | 'control' | 'trustworthiness' | 'deference';

export type CaseStatus = 'draft' | 'under-review' | 'approved' | 'rejected';

export type EvidenceType = 'eval' | 'guardrail' | 'hitl' | 'red-team' | 'audit';

export type EvidenceStatus = 'met' | 'partial' | 'unmet';

export interface EvidenceItem {
  label: string;
  type: EvidenceType;
  status: EvidenceStatus;
  /** Optional cross-link to the platform surface that owns/evidences this item. */
  link?: string;
  /** One-line note on what the evidence shows. */
  note?: string;
}

export interface SubClaim {
  /** The sub-claim being argued (a proposition the evidence must support). */
  claim: string;
  evidence: EvidenceItem[];
}

export interface SafetyCase {
  id: string;
  /** The agent / use case this case supports a deploy decision for. */
  system: string;
  useCase: string;
  /** Top-level claim: "system X is safe to deploy for use Y". */
  topClaim: string;
  /** Which of the four Clymer argument types carries the case. */
  argumentType: ArgumentType;
  /** A one-line summary of why this argument type fits. */
  argumentRationale: string;
  status: CaseStatus;
  owner: string;
  lastReviewed: string;
  subClaims: SubClaim[];
}

/** Presentation metadata for the four Clymer argument types. */
export const ARGUMENT_TYPES: Record<ArgumentType, { name: string; gist: string }> = {
  inability: {
    name: 'Inability',
    gist: 'The system is incapable of causing the harm — dangerous capability is absent or below threshold.',
  },
  control: {
    name: 'Control',
    gist: 'The system is prevented from causing harm — guardrails, scoping, and human oversight contain it.',
  },
  trustworthiness: {
    name: 'Trustworthiness',
    gist: 'The system will not try to cause harm — behavior is aligned and robust under evaluation.',
  },
  deference: {
    name: 'Deference',
    gist: 'A trusted overseer (human or verified system) vouches that the system is safe to deploy.',
  },
};

export const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  'eval': 'Eval',
  'guardrail': 'Guardrail',
  'hitl': 'Human oversight',
  'red-team': 'Red-team',
  'audit': 'Audit',
};

export const SAFETY_CASES: SafetyCase[] = [
  {
    id: 'sc-claims-copilot',
    system: 'Claims Triage Copilot',
    useCase: 'assisting adjusters with first-notice-of-loss triage (human approves every action)',
    topClaim:
      'The Claims Triage Copilot is safe to deploy for adjuster-assisted FNOL triage, because it cannot take a consequential action without human approval and its outputs are contained by content and PII guardrails.',
    argumentType: 'control',
    argumentRationale:
      'The agent is capable of drafting decisions but is held below the harm threshold by mandatory human approval and enforced guardrails — a Control argument.',
    status: 'approved',
    owner: 'Claims Platform / Risk',
    lastReviewed: '2026-05-30',
    subClaims: [
      {
        claim: 'No consequential action executes without an explicit human decision.',
        evidence: [
          { label: 'Human-in-the-loop on all payout/deny actions', type: 'hitl', status: 'met',
            link: '/govern/agents?tab=human-oversight', note: '100% of consequential tool calls gated on approval.' },
          { label: 'Approval audit trail (who/what/when)', type: 'audit', status: 'met',
            link: '/govern/audit', note: 'Every approval logged and immutable.' },
        ],
      },
      {
        claim: 'Harmful, off-scope, or PII-leaking output is blocked before it reaches a user.',
        evidence: [
          { label: 'Content-safety guardrail (Bedrock Guardrails)', type: 'guardrail', status: 'met',
            link: '/secure/guardrails', note: 'Toxicity + off-topic denial active in prod.' },
          { label: 'PII redaction guardrail', type: 'guardrail', status: 'met',
            link: '/secure/guardrails', note: 'Policyholder PII masked in all drafts.' },
          { label: 'Jailbreak / prompt-injection red-team', type: 'red-team', status: 'partial',
            link: '/govern/safety/evals', note: 'Passed HarmBench; injection suite still expanding.' },
        ],
      },
      {
        claim: 'The agent stays within its authorized scope and cannot escalate.',
        evidence: [
          { label: 'Capability threshold: autonomy/ARA below gate', type: 'eval', status: 'met',
            link: '/govern/safety/capabilities', note: 'No self-directed tool acquisition observed.' },
          { label: 'Scope conformance eval (tool allow-list)', type: 'eval', status: 'met',
            link: '/govern/safety/evals' },
        ],
      },
    ],
  },
  {
    id: 'sc-kb-assistant',
    system: 'Policy Knowledge Assistant',
    useCase: 'answering internal staff questions from an approved policy knowledge base (read-only)',
    topClaim:
      'The Policy Knowledge Assistant is safe to deploy for read-only internal Q&A, because it has no action-taking capability and its factual grounding is monitored for hallucination.',
    argumentType: 'inability',
    argumentRationale:
      'The assistant has no tools that can affect the world (retrieval + text only), so the primary argument is Inability — it cannot cause operational harm.',
    status: 'under-review',
    owner: 'Knowledge Ops',
    lastReviewed: '2026-06-12',
    subClaims: [
      {
        claim: 'The agent has no capability to take consequential real-world actions.',
        evidence: [
          { label: 'Tool inventory: retrieval + generation only', type: 'audit', status: 'met',
            link: '/govern/agents', note: 'No write, payment, or external-call tools registered.' },
          { label: 'Capability register: no dangerous capabilities in scope', type: 'eval', status: 'met',
            link: '/govern/safety/capabilities' },
        ],
      },
      {
        claim: 'Answers are grounded in approved sources and hallucination stays bounded.',
        evidence: [
          { label: 'Grounding / hallucination monitoring', type: 'eval', status: 'partial',
            link: '/govern/models?tab=monitoring', note: 'Groundedness ~0.92; below 0.95 target.' },
          { label: 'Citation-coverage eval', type: 'eval', status: 'partial',
            link: '/govern/safety/evals', note: 'Uncited-claim rate being reduced.' },
        ],
      },
      {
        claim: 'Sensitive or confidential content is not surfaced to unauthorized staff.',
        evidence: [
          { label: 'Access-control / data classification', type: 'guardrail', status: 'unmet',
            link: '/govern/data', note: 'Row-level KB access controls not yet enforced.' },
          { label: 'Confidentiality red-team', type: 'red-team', status: 'unmet',
            link: '/govern/safety/evals', note: 'Not yet run for this use case.' },
        ],
      },
    ],
  },
  {
    id: 'sc-underwriting-agent',
    system: 'Underwriting Decision Agent',
    useCase: 'recommending underwriting decisions on standard-risk policies with a senior-underwriter overseer',
    topClaim:
      'The Underwriting Decision Agent is safe to deploy for standard-risk recommendations, because a senior underwriter reviews and vouches for its decisions and its behavior is aligned under adversarial testing.',
    argumentType: 'deference',
    argumentRationale:
      'A trusted senior-underwriter overseer signs off on decisions and can override; the case defers safety judgment to that verified overseer — a Deference argument, backstopped by trustworthiness evidence.',
    status: 'draft',
    owner: 'Underwriting / Model Risk',
    lastReviewed: '2026-06-18',
    subClaims: [
      {
        claim: 'A qualified overseer reviews recommendations and can override before bind.',
        evidence: [
          { label: 'Senior-underwriter sign-off (HITL)', type: 'hitl', status: 'met',
            link: '/govern/agents?tab=human-oversight', note: 'Two-person review on non-standard risk.' },
          { label: 'Override + rationale audit trail', type: 'audit', status: 'partial',
            link: '/govern/audit', note: 'Override capture live; rationale tagging in progress.' },
        ],
      },
      {
        claim: 'Recommendations are fair and do not encode prohibited bias.',
        evidence: [
          { label: 'Fairness / disparate-impact eval', type: 'eval', status: 'partial',
            link: '/govern/models?tab=explainability', note: 'Protected-class parity within tolerance on 3 of 4 slices.' },
          { label: 'Adversarial bias red-team', type: 'red-team', status: 'unmet',
            link: '/govern/safety/evals', note: 'Scheduled; not yet executed.' },
        ],
      },
      {
        claim: 'The agent behaves consistently and does not game the overseer.',
        evidence: [
          { label: 'Behavioral consistency eval', type: 'eval', status: 'partial',
            link: '/govern/safety/evals' },
          { label: 'Deception / sycophancy red-team', type: 'red-team', status: 'unmet',
            link: '/govern/safety/evals', note: 'Required before promotion out of draft.' },
        ],
      },
    ],
  },
];

/** Share of a case's evidence items that are 'met' (0–100). A completeness signal, not a safety score. */
export function evidenceCoverage(sc: SafetyCase): number {
  const items = sc.subClaims.flatMap(c => c.evidence);
  if (items.length === 0) return 0;
  const met = items.filter(e => e.status === 'met').length;
  return Math.round((met / items.length) * 100);
}
