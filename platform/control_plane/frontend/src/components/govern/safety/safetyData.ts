/**
 * safetyData — shared constructs for the AI Safety module.
 *
 * Organizing spine: AWS's 8 Responsible-AI dimensions, crosswalked to NIST AI
 * RMF. Each dimension names the platform signals that evidence it, so the RAI
 * Coverage Rubric can aggregate what the platform already computes rather than
 * inventing new data.
 *
 * Sources: AWS Responsible AI (8 dimensions); NIST AI RMF 1.0 (Govern/Map/
 * Measure/Manage + trustworthiness characteristics).
 */

export type RaiDimensionId =
  | 'fairness'
  | 'explainability'
  | 'privacy-security'
  | 'safety'
  | 'controllability'
  | 'veracity-robustness'
  | 'governance'
  | 'transparency';

export interface RaiDimension {
  id: RaiDimensionId;
  name: string;
  blurb: string;
  nistCrosswalk: string;   // NIST AI RMF characteristic/function
  /** Platform surfaces that evidence this dimension (cross-links, not owned here). */
  evidencedBy: { label: string; to: string }[];
}

export const RAI_DIMENSIONS: RaiDimension[] = [
  {
    id: 'fairness', name: 'Fairness',
    blurb: 'Impacts across stakeholder groups; bias tested and bounded.',
    nistCrosswalk: 'NIST: Fair — harmful bias managed',
    evidencedBy: [{ label: 'Model Explainability (bias/fairness)', to: '/govern/models?tab=explainability' }],
  },
  {
    id: 'explainability', name: 'Explainability',
    blurb: 'System outputs can be understood and evaluated.',
    nistCrosswalk: 'NIST: Explainable & Interpretable',
    evidencedBy: [{ label: 'Model Explainability (SHAP/LIME)', to: '/govern/models?tab=explainability' }],
  },
  {
    id: 'privacy-security', name: 'Privacy & Security',
    blurb: 'Data and models obtained, used, and protected appropriately.',
    nistCrosswalk: 'NIST: Secure & Resilient / Privacy-Enhanced',
    evidencedBy: [
      { label: 'Data Governance (PII, access)', to: '/govern/data' },
      { label: 'Guardrails (PII redaction)', to: '/secure/guardrails' },
    ],
  },
  {
    id: 'safety', name: 'Safety',
    blurb: 'Harmful output and misuse prevented; capability within safe bounds.',
    nistCrosswalk: 'NIST: Safe',
    evidencedBy: [
      { label: 'Frontier Capability Thresholds', to: '/govern/safety/capabilities' },
      { label: 'Threat Modeling (MAESTRO)', to: '/govern/safety/threat-modeling' },
      { label: 'Guardrails (content safety)', to: '/secure/guardrails' },
      { label: 'Runtime Safety Controls', to: '/govern/safety/runtime' },
    ],
  },
  {
    id: 'controllability', name: 'Controllability',
    blurb: 'Mechanisms to monitor and steer agent behavior.',
    nistCrosswalk: 'NIST: Manage — response & recovery',
    evidencedBy: [
      { label: 'Human Oversight (HITL)', to: '/govern/agents?tab=human-oversight' },
      { label: 'Emergency Controls (kill switch)', to: '/govern/fleet' },
      { label: 'Alignment Drift Detection', to: '/govern/safety/runtime?tab=drift' },
      { label: 'Forbidden Targets (blocklist)', to: '/govern/safety/runtime?tab=forbidden' },
    ],
  },
  {
    id: 'veracity-robustness', name: 'Veracity & Robustness',
    blurb: 'Correct outputs even under unexpected or adversarial inputs.',
    nistCrosswalk: 'NIST: Valid & Reliable',
    evidencedBy: [
      { label: 'Hallucination Detection', to: '/govern/models?tab=operations' },
      { label: 'Red-Team & Safety Evals', to: '/govern/safety/evals' },
      { label: 'Model Monitoring (drift)', to: '/govern/models?tab=operations' },
      { label: 'Reliability Metrics', to: '/govern/safety/runtime?tab=reliability' },
    ],
  },
  {
    id: 'governance', name: 'Governance',
    blurb: 'Best practices across the AI supply chain; decisions documented.',
    nistCrosswalk: 'NIST: Govern function',
    evidencedBy: [
      { label: 'Compliance Center', to: '/govern/compliance' },
      { label: 'Incident Management', to: '/govern/safety/incidents' },
      { label: 'Audit & Incidents', to: '/govern/audit' },
    ],
  },
  {
    id: 'transparency', name: 'Transparency',
    blurb: 'Stakeholders can make informed choices about engaging with the system.',
    nistCrosswalk: 'NIST: Accountable & Transparent',
    evidencedBy: [
      { label: 'Safety Cases', to: '/govern/safety/safety-cases' },
      { label: 'Audit trail', to: '/govern/audit' },
    ],
  },
];

/** The Safety module's surfaces (used by the landing hub). */
export interface SafetySurface {
  id: string;
  name: string;
  path: string;
  blurb: string;
  icon: string;
  dimensions: RaiDimensionId[];
  status: 'live' | 'illustrative';
  tag?: string;
  /** Safety-lifecycle phase this surface belongs to. */
  phase: SafetyPhase;
}

/** The safety lifecycle — the story the surfaces tell, in order. */
export type SafetyPhase = 'assess' | 'prevent' | 'assure' | 'respond';

export const SAFETY_PHASES: { id: SafetyPhase; name: string; blurb: string }[] = [
  { id: 'assess',  name: 'Assess',  blurb: 'Understand capability & threat exposure' },
  { id: 'prevent', name: 'Prevent', blurb: 'Gate & constrain before deployment' },
  { id: 'assure',  name: 'Assure',  blurb: 'Evidence & continuously test safety' },
  { id: 'respond', name: 'Respond', blurb: 'Detect, report & remediate incidents' },
];

export const SAFETY_SURFACES: SafetySurface[] = [
  {
    id: 'rubric', name: 'RAI Coverage Rubric', path: '/govern/safety',
    blurb: 'Per-agent scorecard across the 8 Responsible-AI dimensions, aggregating signals the platform already computes.',
    icon: 'squares-2x2', dimensions: ['fairness', 'explainability', 'privacy-security', 'safety', 'controllability', 'veracity-robustness', 'governance', 'transparency'],
    status: 'illustrative', tag: 'AWS 8 dimensions', phase: 'assess',
  },
  {
    id: 'threat-modeling', name: 'Threat Modeling', path: '/govern/safety/threat-modeling',
    blurb: 'MAESTRO 7-layer threat model for autonomous capabilities, mapped to OWASP Agentic T1–T17 and the platform controls that mitigate each.',
    icon: 'shield-exclamation', dimensions: ['safety', 'controllability'],
    status: 'live', tag: 'MAESTRO · OWASP', phase: 'assess',
  },
  {
    id: 'capabilities', name: 'Frontier Capability Thresholds', path: '/govern/safety/capabilities',
    blurb: 'Per-model dangerous-capability register (CBRN, offensive cyber, autonomy/ARA) with framework attestation, gating deployment.',
    icon: 'flag', dimensions: ['safety', 'governance'],
    status: 'illustrative', tag: 'FMSF · RSP · METR', phase: 'prevent',
  },
  {
    id: 'safety-cases', name: 'Safety Cases', path: '/govern/safety/safety-cases',
    blurb: 'Structured claims–arguments–evidence supporting each deploy decision (GSN/CAE, Clymer taxonomy).',
    icon: 'document-check', dimensions: ['governance', 'transparency'],
    status: 'illustrative', tag: 'GSN · CAE', phase: 'assure',
  },
  {
    id: 'evals', name: 'Red-Team & Safety Evals', path: '/govern/safety/evals',
    blurb: 'Red-team coverage, findings, and safety-benchmark scores (HarmBench, WMDP, AILuminate, Cybench).',
    icon: 'beaker', dimensions: ['veracity-robustness', 'safety'],
    status: 'illustrative', tag: 'METR · Inspect', phase: 'assure',
  },
  {
    id: 'incidents', name: 'Incident Management', path: '/govern/safety/incidents',
    blurb: 'Incident lifecycle, near-miss capture, and EU AI Act Article 73 reporting clocks (2/10/15-day).',
    icon: 'exclamation-triangle', dimensions: ['governance', 'controllability'],
    status: 'illustrative', tag: 'EU Art.73 · CoSAI', phase: 'respond',
  },
  {
    id: 'playbooks', name: 'Incident Playbooks', path: '/govern/safety/playbooks',
    blurb: 'SSM-backed runbook templates for AI incident response — agent quarantine, guardrail escalation, model rollback, PII exposure, prompt injection.',
    icon: 'clipboard-list', dimensions: ['governance', 'controllability', 'safety'],
    status: 'illustrative', tag: 'AWS SSM · Art.73', phase: 'respond',
  },
  {
    id: 'runtime-safety', name: 'Runtime Safety Controls', path: '/govern/safety/runtime',
    blurb: 'Forbidden targets (blocklist), alignment drift detection, and reliability metrics — runtime controls from LLM pen-testing research.',
    icon: 'shield-check', dimensions: ['safety', 'controllability', 'veracity-robustness'],
    status: 'live', tag: 'Happe&Cito 2025 · CaMeL', phase: 'prevent',
  },
];
