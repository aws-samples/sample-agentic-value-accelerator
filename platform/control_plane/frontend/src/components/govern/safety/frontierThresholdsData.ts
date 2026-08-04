/**
 * frontierThresholdsData — per-model Frontier Capability Thresholds register.
 *
 * The frontier-safety pattern every lab converged on:
 *   critical capability threshold → dangerous-capability eval → deploy/no-deploy gate.
 *
 * We track, per model: which safety framework/level covers it (Amazon FMSF,
 * Anthropic RSP ASL-N, OpenAI Preparedness tier, DeepMind FSF CCL), whether it
 * carries a Seoul/Korea Frontier AI Safety Commitment attestation, and the eval
 * status across the three FMSF critical-capability domains (CBRN, offensive
 * cyber, autonomy/ARA).
 *
 * HONESTY (design doc §6): we surface the ATTESTATION and the lab-reported eval
 * status — we do NOT auto-judge dangerous capability (that is the lab's own
 * expert eval, often needing white-box access AVA lacks). The deploy-gate verdict
 * below is a mechanical roll-up of the attested statuses, not an independent
 * capability judgment. All data is illustrative.
 *
 * Sources: Amazon Frontier Model Safety Framework (critical capability
 * thresholds + deploy gate); Anthropic RSP / ASL; OpenAI Preparedness Framework
 * v2; DeepMind Frontier Safety Framework (CCLs); Seoul/Korea Frontier AI Safety
 * Commitments; METR (Inspect, RE-Bench, HCAST, autonomy/ARA · RepliBench).
 */

/** Eval status for a single critical-capability domain. */
export type ThresholdStatus =
  | 'below-threshold'
  | 'approaching'
  | 'exceeded'
  | 'not-evaluated';

/** The three FMSF critical-capability domains. */
export type CapabilityDomainId = 'cbrn' | 'cyber' | 'autonomy';

export interface CapabilityDomain {
  id: CapabilityDomainId;
  name: string;
  short: string;
  blurb: string;
  /** Illustrative eval artifact referenced for this domain. */
  evalRef: string;
}

export const CAPABILITY_DOMAINS: CapabilityDomain[] = [
  {
    id: 'cbrn',
    name: 'CBRN Uplift',
    short: 'CBRN',
    blurb: 'Chemical, biological, radiological & nuclear uplift for a malicious actor.',
    evalRef: 'FMSF CBRN uplift suite · uplift-over-baseline',
  },
  {
    id: 'cyber',
    name: 'Offensive Cyber',
    short: 'Cyber',
    blurb: 'Autonomous discovery & exploitation of vulnerabilities; end-to-end cyber ops.',
    evalRef: 'Cybench · CTF / exploit-chain evals',
  },
  {
    id: 'autonomy',
    name: 'Automated AI R&D / Autonomy-ARA',
    short: 'Autonomy',
    blurb: 'Autonomous replication & adaptation and self-improving AI R&D.',
    evalRef: 'METR ARA · RepliBench · RE-Bench',
  },
];

/** A per-domain eval result for a model. */
export interface DomainEval {
  status: ThresholdStatus;
  /** Short evidence note, e.g. "METR ARA suite: below threshold". */
  note: string;
}

/** Deploy-gate verdict, derived from the domain statuses. */
export type DeployVerdict = 'cleared' | 'conditional' | 'blocked';

export interface FrontierModel {
  id: string;
  name: string;
  vendor: string;
  /** Governing safety framework + level, e.g. "Anthropic RSP · ASL-3". */
  framework: string;
  /** Short framework family tag for grouping/legend. */
  frameworkTag: 'FMSF' | 'RSP' | 'Preparedness' | 'FSF';
  /** Seoul / Korea Frontier AI Safety Commitment attested. */
  seoulCommitment: boolean;
  /** Per-domain eval results, keyed by domain id. */
  evals: Record<CapabilityDomainId, DomainEval>;
}

/**
 * Illustrative register. Statuses are lab-attested (illustrative), not judged
 * by AVA. Mix of frameworks so the matrix shows the cross-lab convergence.
 */
export const FRONTIER_MODELS: FrontierModel[] = [
  {
    id: 'claude-opus',
    name: 'Claude Opus',
    vendor: 'Anthropic',
    framework: 'Anthropic RSP · ASL-3',
    frameworkTag: 'RSP',
    seoulCommitment: true,
    evals: {
      cbrn: { status: 'approaching', note: 'ASL-3 CBRN safeguards active; uplift approaching threshold' },
      cyber: { status: 'below-threshold', note: 'Cybench: below threshold' },
      autonomy: { status: 'below-threshold', note: 'METR ARA suite: below threshold' },
    },
  },
  {
    id: 'claude-sonnet',
    name: 'Claude Sonnet',
    vendor: 'Anthropic',
    framework: 'Anthropic RSP · ASL-2',
    frameworkTag: 'RSP',
    seoulCommitment: true,
    evals: {
      cbrn: { status: 'below-threshold', note: 'ASL-2 CBRN evals: below threshold' },
      cyber: { status: 'below-threshold', note: 'Cybench: below threshold' },
      autonomy: { status: 'below-threshold', note: 'METR ARA suite: below threshold' },
    },
  },
  {
    id: 'claude-haiku',
    name: 'Claude Haiku',
    vendor: 'Anthropic',
    framework: 'Anthropic RSP · ASL-2',
    frameworkTag: 'RSP',
    seoulCommitment: true,
    evals: {
      cbrn: { status: 'below-threshold', note: 'ASL-2 CBRN evals: below threshold' },
      cyber: { status: 'below-threshold', note: 'Cybench: below threshold' },
      autonomy: { status: 'not-evaluated', note: 'Autonomy suite not yet run for this tier' },
    },
  },
  {
    id: 'nova-pro',
    name: 'Nova Pro',
    vendor: 'Amazon',
    framework: 'Amazon FMSF · Critical Capability Thresholds',
    frameworkTag: 'FMSF',
    seoulCommitment: true,
    evals: {
      cbrn: { status: 'below-threshold', note: 'FMSF CBRN uplift suite: below threshold' },
      cyber: { status: 'approaching', note: 'Cybench exploit-chain: approaching threshold' },
      autonomy: { status: 'below-threshold', note: 'RepliBench ARA: below threshold' },
    },
  },
  {
    id: 'nova-lite',
    name: 'Nova Lite',
    vendor: 'Amazon',
    framework: 'Amazon FMSF · Critical Capability Thresholds',
    frameworkTag: 'FMSF',
    seoulCommitment: false,
    evals: {
      cbrn: { status: 'below-threshold', note: 'FMSF CBRN uplift suite: below threshold' },
      cyber: { status: 'below-threshold', note: 'Cybench: below threshold' },
      autonomy: { status: 'not-evaluated', note: 'Autonomy suite not yet run for this tier' },
    },
  },
];

/**
 * Deploy-gate verdict derivation — a mechanical roll-up of attested statuses,
 * NOT an independent capability judgment:
 *   any domain 'exceeded'    → blocked
 *   any domain 'approaching' → conditional
 *   otherwise                → cleared
 * ('not-evaluated' does not by itself block, but is surfaced as a coverage gap.)
 */
export function deriveVerdict(m: FrontierModel): DeployVerdict {
  const statuses = CAPABILITY_DOMAINS.map(d => m.evals[d.id].status);
  if (statuses.includes('exceeded')) return 'blocked';
  if (statuses.includes('approaching')) return 'conditional';
  return 'cleared';
}

// ----- Presentation helpers (colors/labels reused across the view) -----

export const STATUS_COLOR: Record<ThresholdStatus, string> = {
  'below-threshold': '#10b981', // emerald
  'approaching': '#f59e0b',     // amber
  'exceeded': '#ef4444',        // rose
  'not-evaluated': '#94a3b8',   // slate
};

export const STATUS_BADGE: Record<ThresholdStatus, string> = {
  'below-threshold': 'bg-emerald-100 text-emerald-700',
  'approaching': 'bg-amber-100 text-amber-700',
  'exceeded': 'bg-rose-100 text-rose-700',
  'not-evaluated': 'bg-slate-100 text-slate-500',
};

export const STATUS_LABEL: Record<ThresholdStatus, string> = {
  'below-threshold': 'Below threshold',
  'approaching': 'Approaching',
  'exceeded': 'Exceeded',
  'not-evaluated': 'Not evaluated',
};

export const VERDICT_COLOR: Record<DeployVerdict, string> = {
  cleared: '#10b981',
  conditional: '#f59e0b',
  blocked: '#ef4444',
};

export const VERDICT_BADGE: Record<DeployVerdict, string> = {
  cleared: 'bg-emerald-100 text-emerald-700',
  conditional: 'bg-amber-100 text-amber-700',
  blocked: 'bg-rose-100 text-rose-700',
};

export const VERDICT_LABEL: Record<DeployVerdict, string> = {
  cleared: 'Cleared',
  conditional: 'Conditional',
  blocked: 'Blocked',
};
